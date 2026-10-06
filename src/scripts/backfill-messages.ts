// Copies the fitness channel's history and its threads into channel_messages (backfill-messages [--since 2026-10-01], default the start of Season 2); safe to re-run.
import { REST, Routes } from 'discord.js';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { saveMessage } from '../messages.js';

interface RawMessage {
  id: string;
  content: string;
  timestamp: string;
  edited_timestamp: string | null;
  author: { id: string; username: string; global_name: string | null; bot?: boolean };
  attachments: unknown[];
  message_reference?: { message_id?: string };
}

interface RawThread {
  id: string;
  name: string;
  parent_id: string;
}

const channelId = config.recapChannelId;
if (!channelId) throw new Error('RECAP_CHANNEL_ID is not set');

const i = process.argv.indexOf('--since');
const sinceDay = i >= 0 ? process.argv[i + 1]! : '2026-10-01';
const since = DateTime.fromISO(sinceDay, { zone: config.tzName }).startOf('day');
if (!since.isValid) throw new Error(`bad --since "${sinceDay}"`);

const DISCORD_EPOCH = 1420070400000n;
const startId = String((BigInt(since.toMillis()) - DISCORD_EPOCH) << 22n);

const rest = new REST({ version: '10' }).setToken(config.token);
db();

/** Stores a channel or thread's messages after the start date; returns [stored, with text]. */
async function copy(id: string, name: string | null): Promise<[number, number]> {
  let after = startId;
  let stored = 0;
  let withText = 0;
  while (true) {
    const batch = (await rest.get(Routes.channelMessages(id), {
      query: new URLSearchParams({ limit: '100', after }),
    })) as RawMessage[];
    if (batch.length === 0) break;

    // Discord returns each page newest first; walk it oldest first so `after` ends on the newest id.
    batch.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    for (const m of batch) {
      saveMessage({
        id: m.id,
        guildId: config.guildId,
        channelId: id,
        channelName: name,
        authorId: m.author.id,
        authorName: m.author.global_name ?? m.author.username,
        isBot: m.author.bot === true,
        content: m.content,
        createdAt: m.timestamp,
        editedAt: m.edited_timestamp,
        replyToId: m.message_reference?.message_id ?? null,
        attachments: m.attachments.length,
      });
      stored++;
      if (m.content.trim()) withText++;
    }
    after = batch[batch.length - 1]!.id;
    if (batch.length < 100) break;
  }
  return [stored, withText];
}

/** Active threads under the channel plus archived public ones (newest page). */
async function threads(): Promise<RawThread[]> {
  const found = new Map<string, RawThread>();
  const active = (await rest.get(Routes.guildActiveThreads(config.guildId))) as { threads: RawThread[] };
  for (const t of active.threads) if (t.parent_id === channelId) found.set(t.id, t);
  const archived = (await rest.get(Routes.channelThreads(channelId!, 'public'), {
    query: new URLSearchParams({ limit: '100' }),
  })) as { threads: RawThread[] };
  for (const t of archived.threads) found.set(t.id, t);
  return [...found.values()];
}

let totalStored = 0;
let totalText = 0;

const [s, t] = await copy(channelId, null);
console.log(`channel: ${s} messages`);
totalStored += s;
totalText += t;

for (const thread of await threads()) {
  const [ts, tt] = await copy(thread.id, thread.name);
  console.log(`thread "${thread.name}": ${ts} messages`);
  totalStored += ts;
  totalText += tt;
}

console.log(`stored ${totalStored} messages since ${since.toISODate()} (${totalText} with readable text)`);
if (totalStored > 0 && totalText === 0) {
  console.log('Every message came back empty: the Message Content intent is off (Dev portal -> Bot -> Privileged Gateway Intents).');
}
