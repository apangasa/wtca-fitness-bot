import { DateTime } from 'luxon';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import {
  BODY_LB,
  MAX_SINGLE_ENTRY,
  YARDS_PER_METER,
  formatAmount,
  formatPoints,
  formatWeight,
  unitSuffix,
  weightIsRequired,
  type Unit,
} from '../exercises.js';
import {
  addEntry,
  dayDetails,
  dayTotals,
  bodyWeightOf,
  ensureUser,
  getExercise,
  listExercises,
  priceAt,
  undoLastEntry,
  type ExerciseRow,
} from '../db/queries.js';
import { renderDailyCard } from '../render/charts.js';
import { config } from '../config.js';
import { currentSeason, isClosed, seasonForDay, seasonRange } from '../seasons.js';
import { dayKeyFor, formatDayKey } from '../time.js';
import { actorName, exerciseChoices, png, type CommandDef } from './types.js';

const REPS_OPTION = 'reps';
const AMOUNT_OPTION = 'amount';
const UNIT_OPTION = 'unit';
const WEIGHT_OPTION = 'weight';
const MAX_LOAD_LB = 2000;

async function guildOnly(interaction: ChatInputCommandInteraction): Promise<string | null> {
  if (interaction.guildId) return interaction.guildId;
  await interaction.reply({ content: 'Run this in the server, not a DM.', flags: MessageFlags.Ephemeral });
  return null;
}

async function reject(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

// Reps read "20 reps"; distances already carry their unit ("1.5mi").
function withUnit(amount: number, unit: Unit): string {
  return unit === 'reps' ? `${formatAmount(amount, unit)} reps` : formatAmount(amount, unit);
}

// One entry, the same way for every exercise: "Push-ups 20 reps", "Bench Press 3×8 @ 135 lb", "Run 1.5mi".
function describeEntry(ex: ExerciseRow, amount: number, weight: number | null, sets = 1): string {
  const count = sets > 1 ? `${sets}×${formatAmount(amount, ex.unit)}` : withUnit(amount, ex.unit);
  const load = weight !== null && weight > 0 ? ` @ ${formatWeight(weight)}` : '';
  return `${ex.label} ${count}${load}`;
}

interface LogOptions {
  // Required for a lift, optional for squats, absent otherwise.
  weight?: number | null;
  // Sets at this weight; reps are multiplied out.
  sets?: number;
}

// A lift always carries the typed weight (no fallback to a previous one); squats with none are bodyweight.
async function applyLog(
  interaction: ChatInputCommandInteraction,
  ex: ExerciseRow,
  amount: number,
  opts: LogOptions = {},
): Promise<void> {
  const guildId = await guildOnly(interaction);
  if (!guildId) return;

  const sets = opts.sets ?? 1;
  const weight = ex.refWeight !== null ? (opts.weight ?? null) : null;

  if (ex.refWeight !== null) {
    if (weight === null && weightIsRequired(ex.refWeight, ex.weightMode)) {
      // Only reachable from a stale cached command definition.
      await reject(interaction, `**${ex.label}** needs a weight (${ex.weightNote ?? 'in lb'}).`);
      return;
    }
    const problem = weight === null ? null : weightProblem(ex, weight);
    if (problem) {
      await reject(interaction, problem);
      return;
    }
  }

  const user = ensureUser(interaction.user.id, actorName(interaction));
  const dayKey = dayKeyFor();
  const total = amount * sets;
  const stored = weight !== null && weight > 0 ? weight : null;
  addEntry(guildId, user.id, ex.key, dayKey, total, stored);

  const today = dayTotals(guildId, dayKey).find((t) => t.userId === user.id && t.exerciseKey === ex.key);

  // Every exercise gets this reply, so points are never mistaken for reps. The price uses the person's own body weight.
  const perUnit = priceAt(ex, stored, bodyWeightOf(user.id));
  const note = stored !== null && ex.weightNote ? ` (${ex.weightNote})` : '';
  const per = ex.unit === 'reps' ? 'rep' : ex.unit;
  const lines = [
    `**${user.displayName}** — ${describeEntry(ex, amount, stored, sets)}${note}: ` +
      `**+${formatPoints(total * perUnit)} pts** (${formatPoints(perUnit)}/${per})`,
    `Today on ${ex.label.toLowerCase()}: ${withUnit(today?.total ?? total, ex.unit)} · ` +
      `${formatPoints(today?.points ?? total * perUnit)} pts`,
  ];
  await interaction.reply(lines.join('\n'));
}

function weightProblem(ex: ExerciseRow, weight: number): string | null {
  if (!Number.isFinite(weight) || weight < 0 || weight > MAX_LOAD_LB) {
    return `${weight} lb is outside what I can score (0–${MAX_LOAD_LB}).`;
  }
  if (ex.weightMode === 'load' && weight === 0) {
    return `**${ex.label}** needs a weight above 0 (${ex.weightNote ?? 'in lb'}).`;
  }
  if (ex.weightMode === 'assist' && weight >= BODY_LB) {
    return (
      `${formatWeight(weight)} of assistance would leave nothing to lift and score 0. ` +
      `Enter the assistance setting, not your body weight.`
    );
  }
  return null;
}

// Discord caps an option description at 100 characters.
const clip = (text: string): string => (text.length <= 100 ? text : `${text.slice(0, 99)}…`);

// One command per exercise row: /benchpress reps weight [sets] for lifts, /squats reps [weight], /pushups reps, /run amount.
function shortcutCommand(ex: ExerciseRow): CommandDef {
  const isLift = weightIsRequired(ex.refWeight, ex.weightMode);
  const countsReps = ex.unit === 'reps';
  const builder = new SlashCommandBuilder().setName(ex.key);

  if (isLift) {
    builder
      .setDescription(clip(`Log ${ex.label.toLowerCase()}: reps and weight`))
      .addIntegerOption((o) =>
        o.setName(REPS_OPTION).setDescription('Reps per set').setRequired(true).setMinValue(1).setMaxValue(1000),
      )
      .addNumberOption((o) =>
        o
          .setName(WEIGHT_OPTION)
          .setDescription(clip(`Weight in lb — ${ex.weightNote ?? 'total load'}`))
          .setRequired(true)
          .setMinValue(0.5)
          .setMaxValue(MAX_LOAD_LB),
      )
      .addIntegerOption((o) =>
        o.setName('sets').setDescription('Sets at this weight (default 1)').setRequired(false).setMinValue(1).setMaxValue(50),
      );
  } else {
    builder.setDescription(`Add to today's ${ex.label.toLowerCase()}`);
    if (countsReps) {
      builder.addIntegerOption((o) =>
        o.setName(REPS_OPTION).setDescription('How many reps to add').setRequired(true).setMinValue(1).setMaxValue(100000),
      );
    } else {
      // Distances use amount, not reps.
      builder.addNumberOption((o) =>
        o
          .setName(AMOUNT_OPTION)
          .setDescription(
            ex.unit === 'yd' ? 'How far (in yards, unless you pick meters)' : `How much to add (${unitSuffix(ex.unit)})`,
          )
          .setRequired(true)
          .setMinValue(0.01)
          .setMaxValue(MAX_SINGLE_ENTRY[ex.key] ?? 100000),
      );
      if (ex.unit === 'yd') {
        // Meters are converted to yards.
        builder.addStringOption((o) =>
          o
            .setName(UNIT_OPTION)
            .setDescription('Yards (default) or meters')
            .setRequired(false)
            .addChoices({ name: 'Yards', value: 'yd' }, { name: 'Meters', value: 'm' }),
        );
      }
    }
    if (ex.refWeight !== null) {
      builder.addNumberOption((o) =>
        o
          .setName(WEIGHT_OPTION)
          .setDescription(clip(`Extra weight in lb — ${ex.weightNote ?? 'added load'} (blank = bodyweight)`))
          .setRequired(false)
          .setMinValue(0)
          .setMaxValue(MAX_LOAD_LB),
      );
    }
  }

  return {
    data: builder.toJSON(),
    execute: async (interaction) => {
      // Re-read: the row may have changed since the command list was built.
      const current = getExercise(ex.key) ?? ex;
      if (isLift) {
        await applyLog(interaction, current, interaction.options.getInteger(REPS_OPTION, true), {
          weight: interaction.options.getNumber(WEIGHT_OPTION, true),
          sets: interaction.options.getInteger('sets') ?? 1,
        });
      } else {
        let amount = countsReps
          ? interaction.options.getInteger(REPS_OPTION, true)
          : interaction.options.getNumber(AMOUNT_OPTION, true);
        if (ex.unit === 'yd' && interaction.options.getString(UNIT_OPTION) === 'm') amount *= YARDS_PER_METER;
        await applyLog(interaction, current, amount, {
          weight: current.refWeight !== null ? interaction.options.getNumber(WEIGHT_OPTION) : null,
        });
      }
    },
  };
}

// The day a correction applies to: today or a past date; null after replying if invalid.
async function resolveDayKey(interaction: ChatInputCommandInteraction): Promise<string | null> {
  const raw = interaction.options.getString('date');
  if (!raw) return dayKeyFor();

  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !DateTime.fromISO(value).isValid) {
    await reject(interaction, `Use \`YYYY-MM-DD\`, e.g. \`${dayKeyFor()}\`.`);
    return null;
  }
  // A fitness day closes at the cutoff, so 1am still belongs to yesterday.
  if (value > dayKeyFor()) {
    await reject(
      interaction,
      `${value} is in the future. The current fitness day is ${dayKeyFor()} (it rolls over at ${config.cutoffHour}:00).`,
    );
    return null;
  }

  // A closed season is frozen: corrections there are a database job.
  const season = seasonForDay(value);
  if (isClosed(season)) {
    const current = currentSeason();
    await reject(
      interaction,
      `${value} is in **${season.label}** (${seasonRange(season)}), which has finished — its standings are final. ` +
        `You can only change ${current.label}, from ${current.startDay} onward.`,
    );
    return null;
  }
  return value;
}

const undoCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('undo')
    .setDescription('Remove your most recent entry')
    .addStringOption((o) =>
      o.setName('exercise').setDescription('Only undo this exercise').setRequired(false).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o.setName('date').setDescription('Which day (YYYY-MM-DD, default today)').setRequired(false),
    )
    .toJSON(),
  autocomplete: exerciseChoices(),
  execute: async (interaction) => {
    const guildId = await guildOnly(interaction);
    if (!guildId) return;

    const dayKey = await resolveDayKey(interaction);
    if (!dayKey) return;
    const when = dayKey === dayKeyFor() ? 'today' : `on ${formatDayKey(dayKey)}`;

    const key = interaction.options.getString('exercise') ?? undefined;
    const removed = undoLastEntry(guildId, interaction.user.id, dayKey, key);
    if (!removed) {
      await reject(interaction, `Nothing to undo ${when}.`);
      return;
    }
    const ex = getExercise(removed.exerciseKey);
    const what = ex
      ? describeEntry(ex, removed.amount, removed.weight)
      : `${removed.amount} ${removed.exerciseKey}`;
    await interaction.reply(`Removed ${what} ${when}.`);
  },
};

const todayCommand: CommandDef = {
  data: new SlashCommandBuilder().setName('today').setDescription("Show today's board").toJSON(),
  execute: async (interaction) => {
    const guildId = await guildOnly(interaction);
    if (!guildId) return;

    // Rendering outlasts Discord's 3s window.
    await interaction.deferReply();
    const dayKey = dayKeyFor();
    const image = await renderDailyCard({
      dayKey,
      exercises: listExercises(),
      totals: dayTotals(guildId, dayKey),
      details: dayDetails(guildId, dayKey),
      guildLabel: interaction.guild?.name ?? 'Fitness',
    });
    await interaction.editReply({
      content: `**${formatDayKey(dayKey)}**`,
      files: [png(image, 'today.png')],
    });
  },
};

export function loggingCommands(): CommandDef[] {
  // A pending exercise gets no command until approved.
  const shortcuts = listExercises()
    .filter((e) => !e.pending)
    .map(shortcutCommand);
  return [...shortcuts, undoCommand, todayCommand];
}
