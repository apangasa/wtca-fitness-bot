// One consistent copy of the live database for upload: VACUUM INTO, since a plain copy can miss writes still in the WAL.
import Database from 'better-sqlite3';
import { rmSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const src =
  process.env.DB_PATH ||
  join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '.', 'wtca-fitness-bot', 'fitness.db');

// POSIX form so it embeds in SQL without escaping.
const dest = process.argv[2] ?? posix.join('out', 'fitness-snapshot.db');

rmSync(dest, { force: true });

const db = new Database(src);
db.exec("VACUUM INTO '" + dest.replaceAll("'", "''") + "'");
db.close();

const snap = new Database(dest, { readonly: true });
const entries = snap.prepare('SELECT COUNT(*) AS c FROM entries').get().c;
const users = snap.prepare('SELECT COUNT(*) AS c FROM users').get().c;
const span = snap.prepare('SELECT MIN(day_key) AS a, MAX(day_key) AS b FROM entries').get();
snap.close();

console.log('    source:   ' + src);
console.log('    snapshot: ' + dest + ' (' + statSync(dest).size + ' bytes)');
console.log('    contains: ' + entries + ' entries, ' + users + ' users, ' + span.a + ' .. ' + span.b);
