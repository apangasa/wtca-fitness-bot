import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { maybeAnnounceClosedSeasons, maybePostRecap } from '../recap.js';
import { dayKeyFor, formatDayKeyShort } from '../time.js';
import type { CommandDef } from './types.js';

async function guildOnly(interaction: ChatInputCommandInteraction): Promise<string | null> {
  if (interaction.guildId) return interaction.guildId;
  await interaction.reply({ content: 'Run this in the server, not a DM.', flags: MessageFlags.Ephemeral });
  return null;
}

// Channels with a /cleanup running; concurrent runs race to delete the same messages.
const cleanupInFlight = new Set<string>();

/** Posts /cleanup never deletes: recaps and leaderboards (matched by attachment name, since content can be blank) and "##" headings. */
export function isKeptPost(content: string, attachmentNames: string[]): boolean {
  return (
    attachmentNames.some((n) => n.startsWith('recap-') || n === 'leaderboard.png') ||
    content.trimStart().startsWith('##')
  );
}

export function adminCommands(): CommandDef[] {
  const recapCommand: CommandDef = {
    data: new SlashCommandBuilder()
      .setName('recap')
      .setDescription('Post the daily recap right now')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .toJSON(),
    execute: async (interaction) => {
      const guildId = await guildOnly(interaction);
      if (!guildId) return;
      // The recap posts publicly; this reply is status only.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // A manual recap covers the day in progress, through the same change detection as the scheduler.
      const dayKey = dayKeyFor();
      const outcome = await maybePostRecap(interaction.client, guildId, dayKey);
      const day = formatDayKeyShort(dayKey);

      // Also posts a season closing message missed while the bot was down.
      const close = await maybeAnnounceClosedSeasons(interaction.client, guildId);
      const closedNote =
        close.announced.length > 0 ? ` Also posted the finish of season ${close.announced.join(', ')}.` : '';

      const replies: Record<typeof outcome.status, string> = {
        posted: `Posted the recap for ${day}.`,
        unchanged: `Nothing has changed since the last recap for ${day} - skipped to avoid a duplicate.`,
        empty: `Nothing logged for ${day} yet.`,
        'no-channel': 'No recap channel is set (RECAP_CHANNEL_ID in .env, or recap_channel_id in the database).',
      };
      await interaction.editReply(replies[outcome.status] + closedNote);
    },
  };

  const cleanupCommand: CommandDef = {
    data: new SlashCommandBuilder()
      .setName('cleanup')
      .setDescription("Delete the bot's recent messages here (keeps recaps and leaderboards)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setDescription('How many of the bot\'s messages to remove (default 10, max 100)')
          .setRequired(false)
          .setMinValue(1)
          // 100 matches the message fetch window; the delete rate limit (about 5 per 5s) fits the 15 minute reply deadline.
          .setMaxValue(100),
      )
      .toJSON(),
    execute: async (interaction) => {
      const guildId = await guildOnly(interaction);
      if (!guildId) return;

      const channel = interaction.channel;
      if (!channel || !('messages' in channel)) {
        await interaction.reply({ content: 'Cannot read this channel.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (cleanupInFlight.has(channel.id)) {
        await interaction.reply({
          content: 'A cleanup is already running in this channel — let it finish, then run it again.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      cleanupInFlight.add(channel.id);

      const count = interaction.options.getInteger('count') ?? 10;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {

        const selfId = interaction.client.user.id;
        const recent = await channel.messages.fetch({ limit: 100 });

        const isKept = (m: { content: string; attachments: { values: () => Iterable<{ name: string }> } }): boolean =>
          isKeptPost(m.content, [...m.attachments.values()].map((a) => a.name));

        const mine = [...recent.values()].filter((m) => m.author.id === selfId);

        // Bulk delete needs Manage Messages, which the bot lacks, so its own messages are deleted one at a time; recaps and leaderboards are never deletable.
        const targets = mine.filter((m) => !isKept(m)).slice(0, count);

        let deleted = 0;
        let alreadyGone = 0;
        let failed = 0;
        for (const message of targets) {
          try {
            await message.delete();
            deleted++;
          } catch (err) {
            // 10008 Unknown Message means something already removed it: not a failure.
            if ((err as { code?: number }).code === 10008) {
              alreadyGone++;
            } else {
              failed++;
              console.error('[cleanup] could not delete', message.id, err);
            }
          }
        }

        const skipped = mine.filter(isKept).length;

        const parts = [`Deleted ${deleted} of my messages.`];
        if (alreadyGone > 0) parts.push(`${alreadyGone} had already been removed.`);
        if (failed > 0) parts.push(`${failed} could not be deleted — see the bot logs.`);
        if (skipped > 0) {
          parts.push(
            `Left ${skipped} recap or leaderboard post${skipped === 1 ? '' : 's'} untouched.`,
          );
        }
        // The scan is a 100-message window, so counts shift as messages disappear.
        if (targets.length === 0) {
          parts.push(mine.length === 0 ? 'I have no messages in the last 100 here.' : 'Nothing matched.');
        } else if (targets.length === count) {
          parts.push('That was the requested maximum — run it again if more remain.');
        }

          await interaction.editReply(parts.join(' '));
      } finally {
        cleanupInFlight.delete(channel.id);
      }
    },
  };

  return [recapCommand, cleanupCommand];
}
