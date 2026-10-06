// Pulls the raw #fitness history to out/history.json. Read-only.
import { REST, Routes } from 'discord.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author: { id: string; username: string; global_name: string | null };
}

const channelId = config.recapChannelId;
if (!channelId) throw new Error('RECAP_CHANNEL_ID is not set');

// Stop once past the first WTCA post (2026-07-19).
const STOP_BEFORE = Date.parse('2026-07-01T00:00:00Z');

const rest = new REST({ version: '10' }).setToken(config.token);
const all: RawMessage[] = [];
let before: string | undefined;

while (true) {
  const query = new URLSearchParams({ limit: '100' });
  if (before) query.set('before', before);

  const batch = (await rest.get(Routes.channelMessages(channelId), {
    query,
  })) as RawMessage[];

  if (batch.length === 0) break;
  all.push(...batch);
  before = batch[batch.length - 1]!.id;

  const oldest = Date.parse(batch[batch.length - 1]!.timestamp);
  process.stdout.write(`\rfetched ${all.length} messages, back to ${new Date(oldest).toISOString().slice(0, 10)}`);
  if (oldest < STOP_BEFORE) break;
  if (batch.length < 100) break;
}

console.log();

const outDir = join(process.cwd(), 'out');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'history.json'), JSON.stringify(all, null, 2));

const withContent = all.filter((m) => m.content && m.content.trim().length > 0).length;
console.log(`total messages:       ${all.length}`);
console.log(`with readable text:   ${withContent}`);
if (all.length > 0 && withContent === 0) {
  console.log('\nAll content came back empty -> the Message Content intent is off.');
  console.log('Dev portal -> Bot -> Privileged Gateway Intents -> Message Content Intent.');
}
console.log(`\nwrote out/history.json`);
