// Opens a COPY of the database with the current code and compares every person's season totals before and after the upgrade.
// `tsx src/scripts/rehearse-upgrade.ts out/live.db`. Never point it at the real file: the migration writes.
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx src/scripts/rehearse-upgrade.ts <copy-of-db>');
  process.exit(2);
}
const path = resolve(file);
process.env.DB_PATH = path;

interface Board {
  [name: string]: number;
}

/** The copy's board as stored before the upgrade runs: reps x points_per_rep, read straight from the raw tables. */
function oldBoard(from: string, to: string): Board {
  const raw = new Database(path, { readonly: true });
  const rows = raw
    .prepare(
      `SELECT u.display_name AS name, SUM(e.amount * x.points_per_rep) AS pts
       FROM entries e JOIN users u ON u.id = e.user_id JOIN exercises x ON x.key = e.exercise_key
       WHERE e.day_key BETWEEN ? AND ? GROUP BY e.user_id`,
    )
    .all(from, to) as { name: string; pts: number }[];
  raw.close();
  return Object.fromEntries(rows.map((r) => [r.name, r.pts]));
}

const SEASON_1 = ['2026-07-18', '2026-09-30'] as const;
const before = oldBoard(...SEASON_1);

const q = await import('../db/queries.js');
const after = Object.fromEntries(
  q.scoreboard(await guild(), ...SEASON_1).map((r) => [r.displayName, r.points]),
) as Board;

async function guild(): Promise<string> {
  const { db } = await import('../db/index.js');
  return (db().prepare('SELECT guild_id FROM entries LIMIT 1').get() as { guild_id: string }).guild_id;
}

let changed = 0;
for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const a = before[name] ?? 0;
  const b = after[name] ?? 0;
  if (Math.abs(a - b) > 1e-9) {
    changed++;
    console.log(`CHANGED  ${name.padEnd(10)} ${a} -> ${b}  (${b - a >= 0 ? '+' : ''}${b - a})`);
  }
}
console.log(`${Object.keys(before).length} people on the Season 1 board; ${changed} total(s) changed.`);

const { db } = await import('../db/index.js');
const conn = db();
const keys = (conn.prepare('SELECT key FROM exercises WHERE active = 1 ORDER BY sort_order').all() as { key: string }[]).map(
  (r) => r.key,
);
console.log(`Active exercises (${keys.length}): ${keys.join(', ')}`);
console.log(
  'Leg press entries:',
  JSON.stringify(conn.prepare("SELECT day_key, amount, weight FROM entries WHERE exercise_key = 'legpress'").all()),
);
console.log('Orphaned entries:', (conn.prepare('SELECT COUNT(*) n FROM entries WHERE exercise_key NOT IN (SELECT key FROM exercises)').get() as { n: number }).n);

// The recap and the freeze run against this data at 04:05; run them now.
const { buildRecapMessage } = await import('../recap.js');
const g = await guild();
const last = (conn.prepare('SELECT MAX(day_key) d FROM entries').get() as { d: string }).d;
const recap = await buildRecapMessage(g, 'WTCA', last);
console.log(`Recap for ${last}: ${recap ? `${recap.content.length} chars, ${recap.files.length} image` : 'none'}`);
const { closeBrowser } = await import('../render/browser.js');
await closeBrowser();
