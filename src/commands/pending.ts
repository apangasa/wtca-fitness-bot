import {
  MessageFlags,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { MAX_LOAD_LB, RESERVED_COMMAND_NAMES, formatWeight, squashName } from '../exercises.js';
import {
  addEntry,
  addPendingNote,
  baseLabel,
  countPending,
  createPendingExercise,
  ensureUser,
  findSimilarExercise,
  listExercises,
  listPending,
  MAX_PENDING,
} from '../db/queries.js';
import { dayKeyFor, formatDayKeyShort } from '../time.js';
import { actorName, reject, type CommandDef } from './types.js';

// "Cable row": first letter up, the rest as typed.
function displayName(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Autocomplete: pending names first (to add to), existing exercises with the command to use.
async function nameAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const typed = squashName(interaction.options.getFocused());
  const all = listExercises();
  const pending = all
    .filter((e) => e.pending && (!typed || squashName(e.label).includes(typed)))
    .map((e) => ({ name: `${baseLabel(e)} - pending, add to it`.slice(0, 100), value: baseLabel(e).slice(0, 100) }));
  const existing = typed
    ? all
        .filter((e) => !e.pending && (squashName(e.key).includes(typed) || squashName(e.label).includes(typed)))
        .map((e) => ({ name: `${e.label} - exists, use /${e.key}`.slice(0, 100), value: e.label.slice(0, 100) }))
    : [];
  await interaction.respond([...pending, ...existing].slice(0, 25));
}

const newCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('new')
    .setDescription('Queue an exercise not in the list yet, and log it if you did it. Scores 0 until priced')
    .addStringOption((o) =>
      o.setName('name').setDescription('What it is, e.g. Cable row').setRequired(true).setMaxLength(32).setAutocomplete(true),
    )
    .addIntegerOption((o) =>
      o.setName('reps').setDescription('Reps per set; leave out to only queue it').setRequired(false).setMinValue(1).setMaxValue(1000),
    )
    .addNumberOption((o) =>
      o
        .setName('weight')
        .setDescription('Total weight in lb, if it has one (both dumbbells combined)')
        .setRequired(false)
        .setMinValue(0.5)
        .setMaxValue(MAX_LOAD_LB),
    )
    .addIntegerOption((o) =>
      o.setName('sets').setDescription('Sets at this weight (default 1)').setRequired(false).setMinValue(1).setMaxValue(50),
    )
    .addStringOption((o) =>
      o
        .setName('notes')
        .setDescription('Anything that helps price it: machine, grip, one arm, etc.')
        .setRequired(false)
        .setMaxLength(100),
    )
    .toJSON(),
  autocomplete: nameAutocomplete,
  execute: async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await reject(interaction, 'Run this in the server, not a DM.');
      return;
    }

    const raw = interaction.options.getString('name', true);
    let key = squashName(raw).slice(0, 32);
    if (!key) {
      await reject(interaction, 'That name has no letters or numbers in it.');
      return;
    }
    if (RESERVED_COMMAND_NAMES.has(key)) {
      await reject(interaction, `\`${raw.trim()}\` is the name of a command, not an exercise. Pick another name.`);
      return;
    }

    const reps = interaction.options.getInteger('reps');
    const sets = interaction.options.getInteger('sets');
    const weight = interaction.options.getNumber('weight');
    // With no reps nothing is logged, so a weight or a set count would be dropped; refuse rather than lose it.
    if (reps === null && (sets !== null || weight !== null)) {
      await reject(interaction, 'Add `reps` to log it, or leave out `weight` and `sets` to only queue it (put anything useful in `notes`).');
      return;
    }

    let notes = interaction.options.getString('notes')?.trim() || null;
    const weightGiven = weight;
    let name = raw;
    let similar = findSimilarExercise(name);
    // A plain exercise takes no weight, so a weight means a weighted variant, priced separately.
    if (similar && !similar.exercise.pending && similar.active && weightGiven && similar.exercise.refWeight === null) {
      const plain = baseLabel(similar.exercise);
      name = `${plain} weighted`;
      key = squashName(name).slice(0, 32);
      notes = [`weighted version of ${plain}`, notes].filter(Boolean).join('; ');
      similar = findSimilarExercise(name);
    }
    if (similar && !similar.exercise.pending) {
      await reject(
        interaction,
        similar.active
          ? `**${similar.exercise.label}** already exists. Log it with \`/${similar.exercise.key}\`.`
          : `**${similar.exercise.label}** was retired. Ask an admin to bring it back.`,
      );
      return;
    }

    let exercise = similar?.exercise;
    if (!exercise) {
      if (countPending() >= MAX_PENDING) {
        await reject(interaction, `The queue is full (${MAX_PENDING} waiting). Try again once some have been priced.`);
        return;
      }
      exercise = createPendingExercise(key, displayName(name), notes);
    } else if (notes) {
      addPendingNote(exercise.key, notes);
    }

    const user = ensureUser(interaction.user.id, actorName(interaction));
    if (reps === null) {
      await interaction.reply(
        `**${user.displayName}** queued **${baseLabel(exercise)}** to be priced; nothing was logged. ` +
          `Once it's priced it gets its own command. \`/queue\` shows what's waiting.`,
      );
      return;
    }
    const setCount = sets ?? 1;
    addEntry(guildId, user.id, exercise.key, dayKeyFor(), reps * setCount, weight);

    const shape = setCount > 1 ? `${setCount}×${reps}` : `${reps} reps`;
    const load = weight ? ` @ ${formatWeight(weight)}` : '';
    await interaction.reply(
      `**${user.displayName}** logged **${baseLabel(exercise)}** ${shape}${load} as pending — no points yet. ` +
        `It's in the queue to be priced, and once it's added your entries are backfilled automatically. ` +
        `\`/queue\` shows what's waiting; \`/undo\` removes a mistake.`,
    );
  },
};

const queueCommand: CommandDef = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Exercises waiting to be priced').toJSON(),
  execute: async (interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await reject(interaction, 'Run this in the server, not a DM.');
      return;
    }
    const pending = listPending(guildId);
    if (pending.length === 0) {
      await reject(interaction, 'Nothing is waiting. Anything logged with `/new` shows up here until it is priced.');
      return;
    }

    const shown = pending.slice(0, 15);
    const lines = shown.map((p) => {
      const weights =
        p.minWeight === null || p.maxWeight === null
          ? 'no weight'
          : p.minWeight === p.maxWeight
            ? formatWeight(p.minWeight)
            : `${formatWeight(p.minWeight).replace(' lb', '')}–${formatWeight(p.maxWeight)}`;
      const days =
        p.firstDay && p.lastDay
          ? p.firstDay === p.lastDay
            ? formatDayKeyShort(p.firstDay)
            : `${formatDayKeyShort(p.firstDay)} – ${formatDayKeyShort(p.lastDay)}`
          : '';
      const note = p.exercise.weightNote ? `\n  _${p.exercise.weightNote}_` : '';
      if (p.logs === 0) return `**${baseLabel(p.exercise)}** — not logged yet${note}`;
      return (
        `**${baseLabel(p.exercise)}** — ${p.logs} log${p.logs === 1 ? '' : 's'} by ${p.people.join(', ')} · ` +
        `${p.reps.toLocaleString('en-US')} reps · ${weights}${days ? ` · ${days}` : ''}${note}`
      );
    });
    const more = pending.length > shown.length ? `\n…and ${pending.length - shown.length} more.` : '';
    await interaction.reply({
      content: `## Waiting to be priced (${pending.length})\nThese score 0 until an admin adds them; entries backfill then.\n${lines.join('\n')}${more}`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export function pendingCommands(): CommandDef[] {
  return [newCommand, queueCommand];
}
