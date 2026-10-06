// Imports parsed channel history (dry run; --commit writes). Totals are SET per person/exercise/day, so re-running is idempotent
// and replaces slash-command entries for days a post covers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { dayTotals, ensureUser, getUser, setDayTotal } from '../db/queries.js';
import { formatAmount } from '../exercises.js';
import { parseHistory } from './parse-history.js';

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name: string | null };
}

const commit = process.argv.includes('--commit');
const outDir = join(process.cwd(), 'out');

const people = JSON.parse(readFileSync(join(outDir, 'people.json'), 'utf8')) as Record<string, string | null>;
const raw = JSON.parse(readFileSync(join(outDir, 'history.json'), 'utf8')) as RawMessage[];
const { entries } = parseHistory(raw);

const unmapped = [...new Set(entries.map((e) => e.name))].filter((n) => !people[n]);
if (unmapped.length > 0) {
  console.error(`Unmapped athletes in people.json: ${unmapped.join(', ')}`);
  process.exit(1);
}

// Sums every line for the same person/exercise/day (three lines can add to 130).
interface Bucket {
  dayKey: string;
  userId: string;
  name: string;
  exerciseKey: string;
  unit: (typeof entries)[number]['unit'];
  total: number;
}

const buckets = new Map<string, Bucket>();
const firstSeen: string[] = [];

for (const e of entries) {
  const userId = people[e.name]!;
  if (!firstSeen.includes(userId)) firstSeen.push(userId);

  const key = `${e.dayKey}|${userId}|${e.exerciseKey}`;
  const cur = buckets.get(key) ?? {
    dayKey: e.dayKey,
    userId,
    name: e.name,
    exerciseKey: e.exerciseKey,
    unit: e.unit,
    total: 0,
  };
  cur.total += e.amount;
  buckets.set(key, cur);
}

const rows = [...buckets.values()].sort(
  (a, b) => a.dayKey.localeCompare(b.dayKey) || a.name.localeCompare(b.name),
);

console.log(`${entries.length} parsed lines -> ${rows.length} person/exercise/day totals`);
console.log(`${firstSeen.length} people, ${new Set(rows.map((r) => r.dayKey)).size} days\n`);

// Show what changes against what is already stored.
const affectedDays = [...new Set(rows.map((r) => r.dayKey))];
const existing = new Map<string, number>();
for (const day of affectedDays) {
  for (const t of dayTotals(config.guildId, day)) {
    existing.set(`${day}|${t.userId}|${t.exerciseKey}`, t.total);
  }
}

const changes = rows.filter((r) => {
  const before = existing.get(`${r.dayKey}|${r.userId}|${r.exerciseKey}`);
  return before === undefined || Math.abs(before - r.total) > 1e-9;
});

console.log(`=== ${changes.length} rows differ from what is stored ===`);
for (const r of changes.slice(0, 12)) {
  const before = existing.get(`${r.dayKey}|${r.userId}|${r.exerciseKey}`);
  const from = before === undefined ? 'none' : formatAmount(before, r.unit);
  console.log(`  ${r.dayKey}  ${r.name.padEnd(8)} ${r.exerciseKey.padEnd(9)} ${from} -> ${formatAmount(r.total, r.unit)}`);
}
if (changes.length > 12) console.log(`  ... and ${changes.length - 12} more`);

const overlaps = rows.filter((r) => existing.has(`${r.dayKey}|${r.userId}|${r.exerciseKey}`));
if (overlaps.length > 0) {
  console.log(`\n=== ${overlaps.length} rows already had data (being SET, not added) ===`);
  for (const r of overlaps) {
    const before = existing.get(`${r.dayKey}|${r.userId}|${r.exerciseKey}`)!;
    console.log(
      `  ${r.dayKey}  ${r.name.padEnd(8)} ${r.exerciseKey.padEnd(9)} ` +
        `stored ${formatAmount(before, r.unit)} -> ${formatAmount(r.total, r.unit)}`,
    );
  }
}

if (!commit) {
  console.log('\nDry run. Nothing written. Re-run with --commit to apply.');
  process.exit(0);
}

// Users are created in first-appearance order so color slots follow join order.
const nameByUserId = new Map<string, string>();
for (const e of entries) if (!nameByUserId.has(people[e.name]!)) nameByUserId.set(people[e.name]!, e.name);

for (const userId of firstSeen) {
  // Existing users keep the display name the live bot maintains.
  if (!getUser(userId)) ensureUser(userId, nameByUserId.get(userId)!);
}

const apply = db().transaction(() => {
  for (const r of rows) setDayTotal(config.guildId, r.userId, r.exerciseKey, r.dayKey, r.total);
});
apply();

console.log(`\nCommitted ${rows.length} totals across ${affectedDays.length} days.`);
