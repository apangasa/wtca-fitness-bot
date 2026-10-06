// Parses out/history.json into entries and reports; writes nothing (import-history uses parseHistory()).
// Shapes: dated "## 7/20/2026 WTCA Fitness" posts (the stated date wins) and bare "Alex: 20" lists before 7/21 (push-ups, day from the timestamp).
import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { join } from 'node:path';
import { config } from '../config.js';
import { listExercises } from '../db/queries.js';
import { normalizeKey, type Unit } from '../exercises.js';

export interface ParsedEntry {
  dayKey: string;
  exerciseKey: string;
  exerciseLabel: string;
  unit: Unit;
  name: string;
  amount: number;
  source: 'structured' | 'bare';
  messageId: string;
}

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name: string | null };
}

const HEADER = /^##\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+WTCA\s+Fitness/im;
const SECTION = /^###\s*(.+?)\s*$/;
// The trailing "(?:@.*)?" keeps weighted sets like "- Alex: 18 @ 9 lbs"; the rep count is what is counted.
const BULLET = /^\s*[-*]\s*([^:]+?)\s*:\s*([\d.]+)\s*([a-z]*)\s*(?:@.*)?$/i;
const BARE = /^\s*([A-Za-z][\w .'-]{0,30}?)\s*:\s*([\d.]+)\s*([a-z]*)\s*(?:@.*)?$/;

// Letters and digits only, so "Push-ups" lands on the seeded pushups key.
const canon = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function buildExerciseResolver(): (label: string) => { key: string; unit: Unit } | null {
  const byCanon = new Map<string, { key: string; unit: Unit }>();
  for (const ex of listExercises()) {
    const value = { key: ex.key, unit: ex.unit };
    byCanon.set(canon(ex.key), value);
    byCanon.set(canon(ex.label), value);
  }
  return (label) => byCanon.get(canon(label)) ?? null;
}

function unitFor(label: string, suffix: string): Unit {
  const s = suffix.toLowerCase();
  if (s === 'mi' || s === 'mile' || s === 'miles') return 'mi';
  if (s === 'km') return 'km';
  if (s === 'min' || s === 'mins' || s === 'm') return 'min';
  return /run|walk|jog|steps|distance/i.test(label) ? 'mi' : 'reps';
}

/** Same 4am rule as the live bot. */
function dayKeyFromTimestamp(iso: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' })
    .setZone(config.tzName)
    .minus({ hours: config.cutoffHour })
    .toISODate()!;
}

export interface ParseResult {
  entries: ParsedEntry[];
  skipped: { messageId: string; line: string; why: string }[];
  supersededDays: string[];
}

export function parseHistory(messages: RawMessage[]): ParseResult {
  const resolveExercise = buildExerciseResolver();
  const sorted = [...messages].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const entries: ParsedEntry[] = [];
  const skipped: ParseResult['skipped'] = [];

  const structuredByDay = new Map<string, ParsedEntry[]>();
  const bareByDay = new Map<string, ParsedEntry[]>();

  for (const m of sorted) {
    if (!m.content?.trim()) continue;
    const header = HEADER.exec(m.content);

    if (header) {
      const [, mo, d, y] = header;
      const dayKey = `${y}-${String(Number(mo)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
      const found: ParsedEntry[] = [];
      let section: string | null = null;

      for (const rawLine of m.content.split('\n')) {
        const line = rawLine.trim();
        if (!line || HEADER.test(line)) continue;

        const sec = SECTION.exec(line);
        if (sec) {
          section = sec[1]!;
          continue;
        }

        const bullet = BULLET.exec(line);
        if (!bullet) {
          if (/^\s*[-*]/.test(line)) skipped.push({ messageId: m.id, line, why: 'bullet did not parse' });
          continue;
        }
        if (!section) {
          skipped.push({ messageId: m.id, line, why: 'bullet before any ### heading' });
          continue;
        }

        const [, name, value, suffix] = bullet;
        const amount = Number.parseFloat(value!);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const known = resolveExercise(section);
        const unit = suffix ? unitFor(section, suffix) : (known?.unit ?? unitFor(section, ''));
        found.push({
          dayKey,
          exerciseKey: known?.key ?? normalizeKey(section),
          exerciseLabel: section,
          unit,
          name: name!.trim(),
          amount,
          source: 'structured',
          messageId: m.id,
        });
      }

      // A day can be posted then re-posted; the later message wins outright.
      if (found.length > 0) structuredByDay.set(dayKey, found);
      continue;
    }

    // Bare list: only treat as data if most non-empty lines are "Name: number".
    const lines = m.content.split('\n').map((l) => l.trim()).filter(Boolean);
    const matches = lines.map((l) => BARE.exec(l)).filter((x): x is RegExpExecArray => x !== null);
    if (lines.length === 0 || matches.length < 2 || matches.length < lines.length - 1) continue;

    const dayKey = dayKeyFromTimestamp(m.timestamp);
    const pushups = resolveExercise('Push-ups');
    const found = matches.map((mt) => {
      const amount = Number.parseFloat(mt[2]!);
      return {
        dayKey,
        exerciseKey: pushups?.key ?? 'pushups',
        exerciseLabel: 'Push-ups',
        unit: 'reps' as Unit,
        name: mt[1]!.trim(),
        amount,
        source: 'bare' as const,
        messageId: m.id,
      };
    }).filter((e) => Number.isFinite(e.amount) && e.amount > 0);

    if (found.length > 0) bareByDay.set(dayKey, [...(bareByDay.get(dayKey) ?? []), ...found]);
  }

  const supersededDays: string[] = [];
  for (const rows of structuredByDay.values()) entries.push(...rows);
  for (const [day, rows] of bareByDay) {
    if (structuredByDay.has(day)) {
      supersededDays.push(day);
      continue;
    }
    entries.push(...rows);
  }

  entries.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  return { entries, skipped, supersededDays };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'out', 'history.json'), 'utf8')) as RawMessage[];
  const { entries, skipped, supersededDays } = parseHistory(raw);

  const days = [...new Set(entries.map((e) => e.dayKey))].sort();
  console.log(`${entries.length} entries across ${days.length} days`);
  console.log(`range: ${days[0]} .. ${days[days.length - 1]}`);
  if (supersededDays.length) {
    console.log(`superseded bare lists (a structured post exists): ${supersededDays.join(', ')}`);
  }

  console.log('\n=== exercises found ===');
  const byEx = new Map<string, { label: string; unit: Unit; total: number; n: number }>();
  for (const e of entries) {
    const cur = byEx.get(e.exerciseKey) ?? { label: e.exerciseLabel, unit: e.unit, total: 0, n: 0 };
    cur.total += e.amount;
    cur.n++;
    byEx.set(e.exerciseKey, cur);
  }
  for (const [key, v] of [...byEx].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${key.padEnd(14)} ${v.label.padEnd(16)} ${String(v.n).padStart(4)} entries  ${v.total} ${v.unit}`);
  }

  console.log('\n=== names found (these need mapping to Discord accounts) ===');
  const byName = new Map<string, { reps: number; n: number; days: Set<string> }>();
  for (const e of entries) {
    const cur = byName.get(e.name) ?? { reps: 0, n: 0, days: new Set<string>() };
    if (e.unit === 'reps') cur.reps += e.amount;
    cur.n++;
    cur.days.add(e.dayKey);
    byName.set(e.name, cur);
  }
  for (const [name, v] of [...byName].sort((a, b) => b[1].reps - a[1].reps)) {
    console.log(`  ${name.padEnd(12)} ${String(v.reps).padStart(6)} reps  ${String(v.n).padStart(3)} entries  ${v.days.size} days`);
  }

  console.log('\n=== per-day totals ===');
  for (const day of days) {
    const rows = entries.filter((e) => e.dayKey === day);
    const reps = rows.filter((r) => r.unit === 'reps').reduce((s, r) => s + r.amount, 0);
    const people = new Set(rows.map((r) => r.name)).size;
    const src = rows[0]?.source ?? '?';
    console.log(`  ${day}  ${String(reps).padStart(5)} reps  ${people} people  (${src})`);
  }

  if (skipped.length) {
    console.log(`\n=== ${skipped.length} lines skipped ===`);
    for (const s of skipped.slice(0, 30)) console.log(`  [${s.why}] ${s.line}`);
  }
}
