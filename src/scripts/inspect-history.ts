// Compact survey of out/history.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author: { id: string; username: string; global_name: string | null };
}

const all = JSON.parse(readFileSync(join(process.cwd(), 'out', 'history.json'), 'utf8')) as RawMessage[];
const sorted = [...all].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

const looksLikeLog = (m: RawMessage): boolean =>
  /wtca/i.test(m.content) || /^#{1,3}\s/m.test(m.content) || /^\s*[-*]\s*\w+\s*:\s*\d/m.test(m.content);

const logs = sorted.filter(looksLikeLog);

console.log(`${all.length} messages total, ${logs.length} look like fitness logs`);
console.log(`oldest overall: ${sorted[0]?.timestamp.slice(0, 10)}`);
console.log(`newest overall: ${sorted[sorted.length - 1]?.timestamp.slice(0, 10)}\n`);

const authors = new Map<string, number>();
for (const m of logs) {
  const name = m.author.global_name ?? m.author.username;
  authors.set(name, (authors.get(name) ?? 0) + 1);
}
console.log('posted by:');
for (const [name, n] of [...authors].sort((a, b) => b[1] - a[1])) console.log(`  ${n} ${name}`);

console.log('\n--- one line per log post ---');
console.log('date        edited  lines  headings  bullets  first line');
for (const m of logs) {
  const lines = m.content.split('\n').filter((l) => l.trim());
  const headings = lines.filter((l) => /^#{1,3}\s/.test(l.trim())).length;
  const bullets = lines.filter((l) => /^\s*[-*]/.test(l)).length;
  console.log(
    `${m.timestamp.slice(0, 10)}  ${m.edited_timestamp ? 'yes ' : 'no  '}  ` +
      `${String(lines.length).padStart(5)}  ${String(headings).padStart(8)}  ${String(bullets).padStart(7)}  ` +
      `${lines[0]?.slice(0, 44) ?? ''}`,
  );
}
