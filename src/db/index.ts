import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { SEED_EXERCISES } from '../exercises.js';
import {
  LIFT_BODY_SHARE,
  SCORING,
  SQUAT_LOADED,
  assertCatalog,
  catalogPricing,
  curveForRow,
  entryPoints,
  parsePricing,
  pricingColumns,
  type Curve,
  type PricingRow,
} from '../scoring.js';
import { dayKeyFor } from '../time.js';
import { seasonRuleFor } from '../seasons.js';
import { GUARDS, SCHEMA } from './schema.js';

let handle: Database.Database | null = null;

export function db(): Database.Database {
  if (handle) {
    refreshScoring(handle);
    return handle;
  }

  assertCatalog(); // the code's own prices must be well formed before anything is read or written
  mkdirSync(dirname(config.dbPath), { recursive: true });
  handle = new Database(config.dbPath);
  handle.exec(SCHEMA);
  migrate(handle);
  handle.exec(GUARDS);
  seedExercises(handle);
  migrateAfterSeed(handle);
  registerScoring(handle);
  warnUnpriced(handle);
  return handle;
}

// A live exercise with no usable pricing record scores 0 (scoring.ts curveForRow); say so at boot, where it is noticed.
function warnUnpriced(conn: Database.Database): void {
  const rows = conn.prepare('SELECT key, pricing FROM exercises WHERE active = 1 AND pending = 0').all() as { key: string; pricing: string | null }[];
  const bad = rows.filter((r) => !parsePricing(r.pricing)).map((r) => r.key);
  if (bad.length > 0) console.error(`scoring: these exercises have no usable pricing record and score 0: ${bad.join(', ')}`);
}

// better-sqlite3 cannot query inside a user function, so exercise rows are cached and reloaded in db() when stale.
// Own writes call invalidateScoring(); another connection's writes change data_version; raw SQL on this connection needs invalidateScoring().
const exerciseRows = new Map<string, PricingRow>();
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
    .prepare('SELECT key, pricing, pending FROM exercises')
    .all() as { key: string; pricing: string | null; pending: number }[];
  exerciseRows.clear();
  curves.clear();
  for (const row of rows) exerciseRows.set(row.key, { key: row.key, pricing: row.pricing, pending: row.pending === 1 });
  seenDataVersion = version;
}

function registerScoring(conn: Database.Database): void {
  // bodyLb is the body weight stored on the entry; NULL is the 150 lb default.
  conn.function('entry_points', (key, amount, weight, bodyLb) => {
    const curve = curveFor(key as string, (bodyLb as number | null) ?? SCORING.BODY_LB);
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

  // One-shot data changes tracked by user_version; versions 1-3 predate pricing records and stay so older databases step through.
  const version = conn.pragma('user_version', { simple: true }) as number;

  const msgCols = conn.prepare('PRAGMA table_info(channel_messages)').all() as { name: string }[];
  if (!msgCols.some((c) => c.name === 'channel_name')) conn.exec('ALTER TABLE channel_messages ADD COLUMN channel_name TEXT');

  const entryCols = conn.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
  if (!entryCols.some((c) => c.name === 'weight')) conn.exec('ALTER TABLE entries ADD COLUMN weight REAL');
  if (!entryCols.some((c) => c.name === 'body_lb')) conn.exec('ALTER TABLE entries ADD COLUMN body_lb REAL');

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
  // The renames below, and the leg press repoint after them, are migration 10's (they run before the seed, which would otherwise insert the new keys first).
  const oldDatabase = version < 10;
  if (oldDatabase && hasKey('leg-press') && !hasKey('legpress')) {
    renameKey('leg-press', 'legpress');
    // Old leg press entries have no weight and a lift with no weight scores 0: record them at 150 lb (runs once, with the rename).
    conn.prepare('UPDATE entries SET weight = 150 WHERE exercise_key = ? AND weight IS NULL').run('legpress');
  }

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

  if (oldDatabase && hasKey('abcrunch') && !hasKey('cablecrunch')) {
    renameKey('abcrunch', 'cablecrunch');
    conn.prepare('UPDATE exercises SET label = ? WHERE key = ?').run('Cable Crunch', 'cablecrunch');
  }
  // Leg curl split into seated and lying. Every entry logged so far was priced from the seated table, so they move to seated.
  if (oldDatabase && hasKey('legcurl') && !hasKey('seatedlegcurl')) {
    renameKey('legcurl', 'seatedlegcurl');
    conn.prepare('UPDATE exercises SET label = ? WHERE key = ?').run('Seated Leg Curl', 'seatedlegcurl');
    // Keep the live pricing record (it may have been tuned); only its table name changes.
    conn
      .prepare(`UPDATE exercises SET pricing = REPLACE(pricing, '"table":"legcurl"', '"table":"seatedlegcurl"') WHERE key = ?`)
      .run('seatedlegcurl');
  }

  // Leg press is priced from the Strength Level horizontal leg press table (was the sled table). Repoints the 150 lb anchors only while they are still the old ones.
  if (oldDatabase) {
    conn
      .prepare(`UPDATE exercises SET pricing = REPLACE(pricing, '"oneRM":[190,297,433,596]', '"oneRM":[139,226,340,478]') WHERE key = ?`)
      .run('legpress');
  }

  // After the renames so a renamed key is priced too.
  if (version < 4) {
    // Migration 4: a pricing record for every catalog exercise.
    backfillCatalogPricing(conn);
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

// A pricing record for every catalog exercise that has none (skips pending rows and distances in another unit).
function backfillCatalogPricing(conn: Database.Database): void {
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
        console.error(`migration: ${row.key} is counted in ${row.unit}, not ${spec.unit}; left without a pricing record`);
        continue;
      }
      const cols = pricingColumns(spec);
      // points_per_rep is derived from the record.
      setShown.run(cols.json, cols.display, row.key);
    }
  })();
}

// One-shot data changes that need a seeded row, so they run after seedExercises; they continue migrate()'s user_version sequence.
function migrateAfterSeed(conn: Database.Database): void {
  const version = conn.pragma('user_version', { simple: true }) as number;
  if (version < 6) {
    // Migration 6 was a one-off data fix, run once against the production database and not kept in source (it named a person).
    conn.pragma('user_version = 6');
  }
  if (version < 7) {
    // Migration 7: the machine lat pulldown was seeded on the plain lat pulldown anchors; it now uses them doubled. Seeds never overwrite, so move the live record (only while it still has the old anchors).
    // The values are fixed here, not read from the catalog, so replaying it later cannot write a price chosen after it.
    const doubled = pricingColumns({ kind: 'lift', oneRM: [178, 248, 332, 430], table: 'machinelatpulldown' });
    conn
      .prepare('UPDATE exercises SET pricing = ?, points_per_rep = ?, ref_weight = ? WHERE key = ? AND pricing = ?')
      .run(doubled.json, doubled.display, doubled.ref, 'machinelatpulldown', JSON.stringify({ kind: 'lift', oneRM: [89, 124, 166, 215], table: 'machinelatpulldown' }));
    conn.pragma('user_version = 7');
    invalidateScoring();
  }
  if (version < 8) {
    // Migration 8 was a one-off data fix, run once against the production database and not kept in source (it named a person).
    conn.pragma('user_version = 8');
  }
  if (version < 9) {
    // Migration 9: the machine lat pulldown anchors go from doubled to x1.5 (only while the live record still has the doubled ones).
    const x15 = pricingColumns({ kind: 'lift', oneRM: [133.5, 186, 249, 322.5], table: 'machinelatpulldown' });
    conn
      .prepare('UPDATE exercises SET pricing = ?, points_per_rep = ?, ref_weight = ? WHERE key = ? AND pricing = ?')
      .run(x15.json, x15.display, x15.ref, 'machinelatpulldown', JSON.stringify({ kind: 'lift', oneRM: [178, 248, 332, 430], table: 'machinelatpulldown' }));
    conn.pragma('user_version = 9');
    invalidateScoring();
  }
  if (version < 10) {
    // Migration 10: the renames and the leg press repoint that used to run on every boot are now behind this version (migrate() runs
    // them first, before the seed). Exercises that have a weight rule in the seed but no reference weight yet get it, once; the seed
    // sets it on insert from now on and never touches an existing row. Last, a pricing record for any catalog exercise still without one.
    const weighted = conn.prepare('UPDATE exercises SET ref_weight = ?, weight_mode = ?, weight_note = ? WHERE key = ? AND ref_weight IS NULL');
    for (const ex of SEED_EXERCISES) {
      const spec = ex.weightNote !== undefined ? catalogPricing(ex.key) : null;
      if (spec && spec.kind !== 'flat') {
        const cols = pricingColumns(spec);
        weighted.run(cols.ref, cols.mode, ex.weightNote ?? null, ex.key);
      }
    }
    backfillCatalogPricing(conn);
    conn.pragma('user_version = 10');
    invalidateScoring();
  }
  if (version < 11) {
    // Migration 11: an entry keeps the body weight it was logged at (entries.body_lb), so a later /weight never rescores it.
    // Entries in the running season take the weight in effect at their time from user_weight_log (a clear is NULL, the default);
    // those before a person's first weight take that first weight. Closed seasons had no body weight, so their entries stay NULL (the default).
    const openFrom = seasonRuleFor(dayKeyFor()).startDay;
    const log = conn.prepare('SELECT user_id, weight_lb, set_at FROM user_weight_log ORDER BY id').all() as { user_id: string; weight_lb: number | null; set_at: string }[];
    const byUser = new Map<string, { weight_lb: number | null; set_at: string }[]>();
    for (const l of log) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);
    const entries = conn.prepare('SELECT id, user_id, day_key, created_at FROM entries WHERE body_lb IS NULL').all() as { id: number; user_id: string; day_key: string; created_at: string }[];
    const set = conn.prepare('UPDATE entries SET body_lb = ? WHERE id = ?');
    conn.transaction(() => {
      for (const e of entries) {
        const rows = byUser.get(e.user_id) ?? [];
        if (e.day_key < openFrom) continue;
        const prior = rows.filter((r) => r.set_at <= e.created_at);
        const lb = prior.length > 0 ? prior[prior.length - 1]!.weight_lb : (rows.find((r) => r.weight_lb !== null)?.weight_lb ?? null);
        if (lb !== null) set.run(lb, e.id);
      }
    })();
    conn.pragma('user_version = 11');
    invalidateScoring();
  }
  if (version < 12) {
    // Migration 12: exercises done one side at a time, logged per side, pay half per rep (docs/points-lifts.md). The keys are fixed
    // here; each live record keeps its tuned numbers and only gains oneSide.
    const rows = conn
      .prepare(`SELECT key, pricing FROM exercises WHERE key IN ('singlelegpress', 'barbellbulgariansplitsquat', 'dbbulgariansplitsquat', 'woodchops', 'sidelyinghipabduction')`)
      .all() as { key: string; pricing: string | null }[];
    const set = conn.prepare('UPDATE exercises SET pricing = ?, points_per_rep = ? WHERE key = ?');
    conn.transaction(() => {
      for (const row of rows) {
        const spec = parsePricing(row.pricing);
        if (!spec || spec.kind === 'flat' || spec.oneSide) continue;
        const cols = pricingColumns({ ...spec, oneSide: true });
        set.run(cols.json, cols.display, row.key);
      }
    })();
    conn.pragma('user_version = 12');
    invalidateScoring();
  }
  if (version < 13) {
    // Migration 13: lunges are one-side too (Strength Level's lunge reps are per leg; players log every step). The live record keeps its numbers.
    const row = conn.prepare("SELECT pricing FROM exercises WHERE key = 'lunges'").get() as { pricing: string | null } | undefined;
    const spec = parsePricing(row?.pricing ?? null);
    if (spec && spec.kind !== 'flat' && !spec.oneSide) {
      const cols = pricingColumns({ ...spec, oneSide: true });
      conn.prepare('UPDATE exercises SET pricing = ?, points_per_rep = ? WHERE key = ?').run(cols.json, cols.display, 'lunges');
    }
    conn.pragma('user_version = 13');
    invalidateScoring();
  }
  if (version < 14) {
    // Migration 14: singlelegextension becomes singlecablelegextension (it is the cable lift; a machine one would use the machine table).
    // Copies the whole row (the key is a foreign key target), repoints the entries, drops the old row.
    const from = 'singlelegextension';
    const to = 'singlecablelegextension';
    const exists = (k: string): boolean => conn.prepare('SELECT 1 FROM exercises WHERE key = ?').get(k) !== undefined;
    if (exists(from) && !exists(to)) {
      conn.transaction(() => {
        conn
          .prepare(
            `INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep, ref_weight, weight_mode, weight_note, pending, pricing)
             SELECT ?, 'Single Cable Leg Extension', unit, sort_order, active, points_per_rep, ref_weight, weight_mode, weight_note, pending, pricing
             FROM exercises WHERE key = ?`,
          )
          .run(to, from);
        conn.prepare('UPDATE entries SET exercise_key = ? WHERE exercise_key = ?').run(to, from);
        conn.prepare('DELETE FROM exercises WHERE key = ?').run(from);
      })();
    }
    conn.pragma('user_version = 14');
    invalidateScoring();
  }
  if (version < 15) {
    // Migration 15: lifts that also move the body count k x body weight as load (docs/points-lifts.md), so an unloaded rep no longer
    // pays 0. Every lift priced on one of those tables (catalog or approved from the queue) keeps its tuned numbers and only gains k.
    const rows = conn.prepare('SELECT key, pricing FROM exercises').all() as { key: string; pricing: string | null }[];
    const set = conn.prepare('UPDATE exercises SET pricing = ?, points_per_rep = ? WHERE key = ?');
    conn.transaction(() => {
      for (const row of rows) {
        const spec = parsePricing(row.pricing);
        if (!spec || spec.kind !== 'lift' || spec.k !== undefined || spec.table === undefined || !Object.hasOwn(LIFT_BODY_SHARE, spec.table)) continue;
        const cols = pricingColumns({ ...spec, k: LIFT_BODY_SHARE[spec.table]! });
        set.run(cols.json, cols.display, row.key);
      }
    })();
    conn.pragma('user_version = 15');
    invalidateScoring();
  }
  if (version < 16) {
    // Migration 16: a squat with a weight is priced on the barbell squat table, body weight counted as load (docs/points-lifts.md, "Squat").
    // Season 2 only. The no-weight price and the rest of the stored record are kept as tuned.
    const row = conn.prepare("SELECT pricing FROM exercises WHERE key = 'squats'").get() as { pricing: string | null } | undefined;
    const spec = parsePricing(row?.pricing ?? null);
    if (spec?.kind === 'bw' && spec.loaded === undefined) {
      const cols = pricingColumns({ ...spec, loaded: { ...SQUAT_LOADED, oneRM: [...SQUAT_LOADED.oneRM] } });
      conn.prepare("UPDATE exercises SET pricing = ?, points_per_rep = ? WHERE key = 'squats'").run(cols.json, cols.display);
    }
    // The weight hint says what to enter now: the bar and plates. Seeds only insert, so the stored row's hint is moved here.
    const note = SEED_EXERCISES.find((e) => e.key === 'squats')?.weightNote;
    if (note) conn.prepare("UPDATE exercises SET weight_note = ? WHERE key = 'squats' AND weight_note = 'added load'").run(note);
    conn.pragma('user_version = 16');
    invalidateScoring();
  }
}

function seedExercises(conn: Database.Database): void {
  // Existing rows are never overwritten: only a key that is missing is inserted, with its weight rule and price.
  const exists = conn.prepare('SELECT 1 FROM exercises WHERE key = ?');
  const nextOrder = conn.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM exercises');
  const insert = conn.prepare(
    `INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep, ref_weight, weight_mode, weight_note, pricing)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  );
  const seed = conn.transaction(() => {
    for (const ex of SEED_EXERCISES) {
      if (exists.get(ex.key)) continue;
      const { n } = nextOrder.get() as { n: number };
      const spec = catalogPricing(ex.key);
      const cols = spec ? pricingColumns(spec) : null;
      // points_per_rep, ref_weight and weight_mode derive from the pricing record; a flat price or an unweighted exercise takes no weight.
      const weighted = ex.weightNote !== undefined && cols !== null && spec!.kind !== 'flat';
      insert.run(ex.key, ex.label, ex.unit, n, cols?.display ?? 0, weighted ? cols.ref : null, weighted ? cols.mode : 'load', weighted ? ex.weightNote : null, cols?.json ?? null);
    }
  });
  seed();
  invalidateScoring();
}
