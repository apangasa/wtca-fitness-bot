import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { SEED_EXERCISES } from '../exercises.js';
import { SCORING, catalogPricing, curveForRow, entryPoints, pricingColumns, type Curve, type PricingRow } from '../scoring.js';
import { SCHEMA } from './schema.js';

let handle: Database.Database | null = null;

export function db(): Database.Database {
  if (handle) {
    refreshScoring(handle);
    return handle;
  }

  mkdirSync(dirname(config.dbPath), { recursive: true });
  handle = new Database(config.dbPath);
  handle.exec(SCHEMA);
  migrate(handle);
  seedExercises(handle);
  migrateAfterSeed(handle);
  registerScoring(handle);
  return handle;
}

// better-sqlite3 cannot query inside a user function, so exercise rows and body weights are cached and reloaded in db() when stale.
// Own writes call invalidateScoring(); another connection's writes change data_version; raw SQL on this connection needs invalidateScoring().
const exerciseRows = new Map<string, PricingRow>();
const bodyWeights = new Map<string, number>();
const curves = new Map<string, Curve>();
let seenDataVersion = -1;

function curveFor(key: string, bodyLb: number): Curve | undefined {
  const id = `${key}|${bodyLb}`;
  let curve = curves.get(id);
  if (!curve) {
    const row = exerciseRows.get(key);
    if (!row) return undefined;
    curve = curveForRow(row, bodyLb);
    curves.set(id, curve);
  }
  return curve;
}

export function invalidateScoring(): void {
  seenDataVersion = -1;
}

function refreshScoring(conn: Database.Database): void {
  const version = conn.pragma('data_version', { simple: true }) as number;
  if (version === seenDataVersion) return;
  const rows = conn
    .prepare('SELECT key, pricing, points_per_rep, ref_weight, weight_mode FROM exercises')
    .all() as (PricingRow & { key: string })[];
  const weights = conn.prepare('SELECT user_id, weight_lb FROM user_weight').all() as { user_id: string; weight_lb: number }[];
  exerciseRows.clear();
  bodyWeights.clear();
  curves.clear();
  for (const row of rows) exerciseRows.set(row.key, row);
  for (const w of weights) bodyWeights.set(w.user_id, w.weight_lb);
  seenDataVersion = version;
}

function registerScoring(conn: Database.Database): void {
  conn.function('entry_points', (key, amount, weight, userId) => {
    const curve = curveFor(key as string, bodyWeights.get(userId as string) ?? SCORING.BODY_LB);
    return curve ? entryPoints(curve, amount as number, (weight as number | null) ?? null) : 0;
  });
  refreshScoring(conn);
}

// Additive schema changes for older databases.
function migrate(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(guild_config)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'last_recap_sig')) {
    conn.exec('ALTER TABLE guild_config ADD COLUMN last_recap_sig TEXT');
  }
  if (!cols.some((c) => c.name === 'last_closed_season')) {
    conn.exec('ALTER TABLE guild_config ADD COLUMN last_closed_season INTEGER');
  }

  const exCols = conn.prepare('PRAGMA table_info(exercises)').all() as { name: string }[];
  if (!exCols.some((c) => c.name === 'points_per_rep')) {
    conn.exec('ALTER TABLE exercises ADD COLUMN points_per_rep REAL NOT NULL DEFAULT 0');
    // Display price from the catalog, on the column-add migration only.
    const set = conn.prepare('UPDATE exercises SET points_per_rep = ? WHERE key = ?');
    const backfill = conn.transaction(() => {
      for (const ex of SEED_EXERCISES) {
        const spec = catalogPricing(ex.key);
        set.run(spec ? pricingColumns(spec).display : 0, ex.key);
      }
    });
    backfill();
  }
  for (const [name, ddl] of [
    ['ref_weight', 'REAL'],
    ['weight_mode', "TEXT NOT NULL DEFAULT 'load'"],
    ['weight_note', 'TEXT'],
    ['pending', 'INTEGER NOT NULL DEFAULT 0'],
    // JSON pricing record (scoring.ts PricingSpec); NULL scores from price x weight / reference weight.
    ['pricing', 'TEXT'],
  ] as const) {
    if (!exCols.some((c) => c.name === name)) conn.exec(`ALTER TABLE exercises ADD COLUMN ${name} ${ddl}`);
  }

  const msgCols = conn.prepare('PRAGMA table_info(channel_messages)').all() as { name: string }[];
  if (!msgCols.some((c) => c.name === 'channel_name')) conn.exec('ALTER TABLE channel_messages ADD COLUMN channel_name TEXT');

  const entryCols = conn.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
  if (!entryCols.some((c) => c.name === 'weight')) conn.exec('ALTER TABLE entries ADD COLUMN weight REAL');

  // Renames a key: copies the row (the key is a foreign key target), repoints the entries, drops the old row.
  const renameKey = conn.transaction((from: string, to: string) => {
    conn
      .prepare(
        `INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep, pricing)
         SELECT ?, label, unit, sort_order, active, points_per_rep, pricing FROM exercises WHERE key = ?`,
      )
      .run(to, from);
    conn.prepare('UPDATE entries SET exercise_key = ? WHERE exercise_key = ?').run(to, from);
    conn.prepare('DELETE FROM exercises WHERE key = ?').run(from);
  });
  const hasKey = (k: string): boolean => conn.prepare('SELECT 1 FROM exercises WHERE key = ?').get(k) !== undefined;
  if (hasKey('leg-press') && !hasKey('legpress')) {
    renameKey('leg-press', 'legpress');
    // Old leg press entries have no weight and a lift with no weight scores 0: record them at 150 lb (runs once, with the rename).
    conn.prepare('UPDATE entries SET weight = 150 WHERE exercise_key = ? AND weight IS NULL').run('legpress');
  }

  // One-shot data changes tracked by user_version; versions 1-3 predate pricing records and stay so older databases step through.
  const version = conn.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    conn.prepare("UPDATE exercises SET points_per_rep = 200 WHERE key = 'run' AND points_per_rep = 0").run();
    conn.pragma('user_version = 1');
  }
  if (version < 2) {
    conn.prepare("UPDATE exercises SET points_per_rep = 12 WHERE key = 'burpees' AND points_per_rep = 18").run();
    conn.pragma('user_version = 2');
  }
  if (version < 3) {
    conn.prepare("UPDATE exercises SET ref_weight = 85 WHERE key = 'legcurl' AND ref_weight = 75").run();
    conn.pragma('user_version = 3');
  }

  if (hasKey('abcrunch') && !hasKey('cablecrunch')) {
    renameKey('abcrunch', 'cablecrunch');
    conn.prepare('UPDATE exercises SET label = ? WHERE key = ?').run('Cable Crunch', 'cablecrunch');
  }
  // Leg curl split into seated and lying. Every entry logged so far was priced from the seated table, so they move to seated.
  if (hasKey('legcurl') && !hasKey('seatedlegcurl')) {
    renameKey('legcurl', 'seatedlegcurl');
    conn.prepare('UPDATE exercises SET label = ? WHERE key = ?').run('Seated Leg Curl', 'seatedlegcurl');
    // Keep the live pricing record (it may have been tuned); only its table name changes.
    conn
      .prepare(`UPDATE exercises SET pricing = REPLACE(pricing, '"table":"legcurl"', '"table":"seatedlegcurl"') WHERE key = ?`)
      .run('seatedlegcurl');
  }

  // Leg press is priced from the Strength Level horizontal leg press table (was the sled table). Repoints the 150 lb anchors only while they are still the old ones.
  conn
    .prepare(`UPDATE exercises SET pricing = REPLACE(pricing, '"oneRM":[190,297,433,596]', '"oneRM":[139,226,340,478]') WHERE key = ?`)
    .run('legpress');

  // After the renames so a renamed key is priced too.
  if (version < 4) {
    // Migration 4: a pricing record for every catalog exercise (skips pending rows and distances in another unit).
    const rows = conn.prepare('SELECT key, unit FROM exercises WHERE pending = 0 AND pricing IS NULL').all() as {
      key: string;
      unit: string;
    }[];
    const setShown = conn.prepare('UPDATE exercises SET pricing = ?, points_per_rep = ? WHERE key = ?');
    conn.transaction(() => {
      for (const row of rows) {
        const spec = catalogPricing(row.key);
        if (!spec) continue;
        if (spec.kind === 'flat' && spec.unit && spec.unit !== row.unit) {
          console.error(`migration 4: ${row.key} is counted in ${row.unit}, not ${spec.unit}; left without a pricing record`);
          continue;
        }
        const cols = pricingColumns(spec);
        // points_per_rep is derived from the record.
        setShown.run(cols.json, cols.display, row.key);
      }
    })();
    conn.pragma('user_version = 4');
    invalidateScoring();
  }

  if (version < 5) {
    // Migration 5: user_weight (current value) and user_weight_log (append-only; a clear is NULL).
    conn.exec(`
      CREATE TABLE IF NOT EXISTS user_weight (
        user_id    TEXT PRIMARY KEY,
        weight_lb  REAL NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_weight_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT NOT NULL,
        weight_lb  REAL,
        set_at     TEXT NOT NULL
      );
    `);
    conn.pragma('user_version = 5');
    invalidateScoring();
  }
}

// One-shot data changes that need a seeded row, so they run after seedExercises; they continue migrate()'s user_version sequence.
function migrateAfterSeed(conn: Database.Database): void {
  const version = conn.pragma('user_version', { simple: true }) as number;
  if (version < 6) {
    // Migration 6: a player's lat pulldowns so far were on a pulley/lever machine, so they move to the machine lift. Later /latpulldown entries stay where they are.
    conn
      .prepare("UPDATE entries SET exercise_key = 'machinelatpulldown' WHERE exercise_key = 'latpulldown' AND user_id = ?")
      .run('0');
    conn.pragma('user_version = 6');
  }
  if (version < 7) {
    // Migration 7: the machine lat pulldown was seeded on the plain lat pulldown anchors; it now uses them doubled. Seeds never overwrite, so move the live record (only while it still has the old anchors).
    const spec = catalogPricing('machinelatpulldown')!;
    const cols = pricingColumns(spec);
    conn
      .prepare('UPDATE exercises SET pricing = ?, points_per_rep = ?, ref_weight = ? WHERE key = ? AND pricing = ?')
      .run(cols.json, cols.display, cols.ref, 'machinelatpulldown', JSON.stringify({ kind: 'lift', oneRM: [89, 124, 166, 215], table: 'machinelatpulldown' }));
    conn.pragma('user_version = 7');
    invalidateScoring();
  }
  if (version < 8) {
    // Migration 8: everything a player logged as lat pulldown was reverse grip, so it moves to the reverse grip lift. Later /latpulldown entries stay where they are.
    conn
      .prepare("UPDATE entries SET exercise_key = 'reversegriplatpulldown' WHERE exercise_key = 'latpulldown' AND user_id = ?")
      .run('0');
    conn.pragma('user_version = 8');
  }
}

function seedExercises(conn: Database.Database): void {
  // Existing rows are never overwritten.
  const exists = conn.prepare('SELECT 1 FROM exercises WHERE key = ?');
  const nextOrder = conn.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM exercises');
  const insert = conn.prepare(
    `INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep, pricing)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  );
  // One-shot per exercise, while ref_weight is NULL.
  const makeWeighted = conn.prepare(
    `UPDATE exercises SET ref_weight = ?, weight_mode = ?, weight_note = ?
     WHERE key = ? AND ref_weight IS NULL`,
  );
  const seed = conn.transaction(() => {
    for (const ex of SEED_EXERCISES) {
      if (!exists.get(ex.key)) {
        const { n } = nextOrder.get() as { n: number };
        const spec = catalogPricing(ex.key);
        const cols = spec ? pricingColumns(spec) : null;
        // points_per_rep, ref_weight and weight_mode derive from the pricing record.
        insert.run(ex.key, ex.label, ex.unit, n, cols?.display ?? 0, cols?.json ?? null);
      }
      const weighted = ex.weightNote !== undefined ? catalogPricing(ex.key) : null;
      if (weighted && weighted.kind !== 'flat') {
        const cols = pricingColumns(weighted);
        makeWeighted.run(cols.ref, cols.mode, ex.weightNote ?? null, ex.key);
      }
    }
  });
  seed();
  invalidateScoring();
}

/** Clean slate for the preview scripts. */
export function resetForTesting(): void {
  const conn = db();
  conn.exec('DELETE FROM entries; DELETE FROM users; DELETE FROM guild_config;');
}
