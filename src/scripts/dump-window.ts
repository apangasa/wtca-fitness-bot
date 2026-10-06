// Dumps raw message content for a date window and a breakdown of textless messages: tsx src/scripts/dump-window.ts 2026-07-18 2026-07-22
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author: { id: string; username: string; global_name: string | null };
  attachments?: unknown[];
  embeds?: unknown[];
  type?: number;
  sticker_items?: unknown[];
}

const from = process.argv[2] ?? '2026-07-18';
const to = process.argv[3] ?? '2026-07-22';

const all = JSON.parse(readFileSync(join(process.cwd(), 'out', 'history.json'), 'utf8')) as RawMessage[];
const sorted = [...all].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

const empty = sorted.filter((m) => !m.content || !m.content.trim());
console.log(`=== ${empty.length} messages with no text ===`);
const reasons = new Map<string, number>();
for (const m of empty) {
  const tags: string[] = [];
  if (m.attachments?.length) tags.push(`attachments:${m.attachments.length}`);
  if (m.embeds?.length) tags.push(`embeds:${m.embeds.length}`);
  if (m.sticker_items?.length) tags.push('sticker');
  if (m.type !== undefined && m.type !== 0) tags.push(`type:${m.type}`);
  const key = tags.length ? tags.join(' ') : 'genuinely empty';
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${reason}`);

const window = sorted.filter((m) => {
  const day = m.timestamp.slice(0, 10);
  return day >= from && day <= to;
});

console.log(`\n=== ${window.length} messages between ${from} and ${to} ===`);
for (const m of window) {
  const who = m.author.global_name ?? m.author.username;
  const edited = m.edited_timestamp ? ' (edited)' : '';
  console.log(`\n----- ${m.timestamp}  ${who}${edited}  [${m.id}] -----`);
  console.log(m.content || '(no text)');
}
