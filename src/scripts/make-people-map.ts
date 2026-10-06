// Writes out/people.json (athlete name -> Discord user id); obvious name matches are guessed, the rest left null.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHistory } from './parse-history.js';

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name: string | null };
}

const outDir = join(process.cwd(), 'out');
const raw = JSON.parse(readFileSync(join(outDir, 'history.json'), 'utf8')) as RawMessage[];
const { entries } = parseHistory(raw);

const athletes = [...new Set(entries.map((e) => e.name))].sort((a, b) => {
  const count = (n: string) => entries.filter((e) => e.name === n).length;
  return count(b) - count(a);
});

const accounts = new Map<string, { id: string; username: string; displayName: string; posts: number }>();
for (const m of raw) {
  const a = m.author;
  const cur = accounts.get(a.id) ?? {
    id: a.id,
    username: a.username,
    displayName: a.global_name ?? a.username,
    posts: 0,
  };
  cur.posts++;
  accounts.set(a.id, cur);
}

const canon = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

console.log('Discord accounts that posted in the channel:');
for (const a of [...accounts.values()].sort((x, y) => y.posts - x.posts)) {
  console.log(`  ${a.id}  ${String(a.posts).padStart(3)} posts  ${a.displayName}  (@${a.username})`);
}

const mapping: Record<string, string | null> = {};
for (const name of athletes) {
  const hit = [...accounts.values()].find(
    (a) => canon(a.displayName) === canon(name) || canon(a.username) === canon(name),
  );
  mapping[name] = hit?.id ?? null;
}

console.log('\nAthlete names in the posts:');
for (const [name, id] of Object.entries(mapping)) {
  const who = id ? accounts.get(id)! : null;
  console.log(`  ${name.padEnd(10)} -> ${id ? `${id}  (${who!.displayName})` : 'UNMAPPED'}`);
}

const target = join(outDir, 'people.json');
if (existsSync(target)) {
  console.log(`\n${target} already exists — leaving it alone so edits are not lost.`);
} else {
  writeFileSync(target, JSON.stringify(mapping, null, 2));
  console.log(`\nwrote ${target} — fill in the nulls with Discord user ids`);
}
