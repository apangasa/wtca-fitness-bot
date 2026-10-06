// Records the fitness channel's chat and its threads; needs the privileged Message Content intent.
import { ChannelType, Events, type AnyThreadChannel, type Client, type Message, type PartialMessage } from 'discord.js';
import { config } from './config.js';
import { db } from './db/index.js';

export interface StoredMessage {
  id: string;
  guildId: string;
  channelId: string;
  // The thread's name, or null for the channel itself.
  channelName: string | null;
  authorId: string;
  authorName: string;
  isBot: boolean;
  content: string;
  createdAt: string;
  editedAt: string | null;
  replyToId: string | null;
  attachments: number;
}

/** Insert, or update the text and edit time of one already stored. A deletion mark is never cleared. */
export function saveMessage(m: StoredMessage): void {
  db()
    .prepare(
      `INSERT INTO channel_messages
         (id, guild_id, channel_id, channel_name, author_id, author_name, is_bot, content, created_at, edited_at, reply_to_id, attachments)
       VALUES (@id, @guildId, @channelId, @channelName, @authorId, @authorName, @isBot, @content, @createdAt, @editedAt, @replyToId, @attachments)
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, created_at = excluded.created_at, edited_at = excluded.edited_at, author_name = excluded.author_name`,
    )
    .run({
      ...m,
      isBot: m.isBot ? 1 : 0,
      // Discord's REST timestamps carry microseconds and +00:00; one format keeps text comparison honest.
      createdAt: new Date(m.createdAt).toISOString(),
      editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
    });
}

export function markMessageDeleted(id: string): void {
  db().prepare('UPDATE channel_messages SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(new Date().toISOString(), id);
}

function fromMessage(m: Message): StoredMessage {
  return {
    id: m.id,
    guildId: m.guildId ?? config.guildId,
    channelId: m.channelId,
    channelName: m.channel.isThread() ? m.channel.name : null,
    authorId: m.author.id,
    authorName: m.member?.displayName ?? m.author.globalName ?? m.author.username,
    isBot: m.author.bot,
    content: m.content,
    createdAt: new Date(m.createdTimestamp).toISOString(),
    editedAt: m.editedTimestamp ? new Date(m.editedTimestamp).toISOString() : null,
    replyToId: m.reference?.messageId ?? null,
    attachments: m.attachments.size,
  };
}

/** The fitness channel itself, or a thread whose parent is it. */
function watching(m: Message | PartialMessage): boolean {
  if (m.channelId === config.recapChannelId) return true;
  return m.channel.isThread() && m.channel.parentId === config.recapChannelId;
}

/** Discord only sends a thread's messages to a bot that is a member of it. */
async function joinThread(thread: AnyThreadChannel): Promise<void> {
  if (thread.parentId !== config.recapChannelId || thread.joined || !thread.joinable) return;
  try {
    await thread.join();
    console.log(`[messages] joined thread "${thread.name}"`);
  } catch (err) {
    console.error(`[messages] could not join thread "${thread.name}":`, err);
  }
}

export async function startMessageCapture(client: Client): Promise<void> {
  if (!config.recapChannelId) {
    console.warn('[messages] RECAP_CHANNEL_ID is not set, so chat is not being recorded');
    return;
  }

  client.on(Events.MessageCreate, (m) => {
    if (!watching(m)) return;
    try {
      saveMessage(fromMessage(m));
    } catch (err) {
      console.error('[messages] save failed:', err);
    }
  });

  client.on(Events.MessageUpdate, async (_old, updated: Message | PartialMessage) => {
    if (!watching(updated)) return;
    try {
      const full = updated.partial ? await updated.fetch() : updated;
      saveMessage(fromMessage(full));
    } catch (err) {
      console.error('[messages] edit failed:', err);
    }
  });

  // An id is unique across Discord, so a deletion needs no channel check: a message we never stored matches no row.
  client.on(Events.MessageDelete, (m) => {
    try {
      markMessageDeleted(m.id);
    } catch (err) {
      console.error('[messages] delete failed:', err);
    }
  });

  client.on(Events.ThreadCreate, (thread) => void joinThread(thread));
  // A thread that was archived comes back (and starts sending messages again) only once we are in it.
  client.on(Events.ThreadUpdate, (_old, thread) => void joinThread(thread));

  try {
    const channel = await client.channels.fetch(config.recapChannelId);
    if (channel && channel.type === ChannelType.GuildText) {
      const { threads } = await channel.threads.fetchActive();
      for (const thread of threads.values()) await joinThread(thread);
    }
  } catch (err) {
    console.error('[messages] could not list threads:', err);
  }

  console.log('[messages] recording the fitness channel and its threads');
}
