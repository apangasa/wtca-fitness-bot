import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { samePoints, type Metric } from '../exercises.js';
import {
  allTimeTotals,
  bestDayForUser,
  currentStreak,
  dailySeries,
  daysLogged,
  ensureUser,
  getExercise,
  getSeasonStandings,
  getUser,
  listExercises,
  rangeTotals,
  scoreboard,
  scoredInPoints,
  setDisplayName,
  type StandingRow,
  type TotalRow,
} from '../db/queries.js';
import { renderHallOfFame, renderLeaderboard, renderPersonalCard, renderTrend } from '../render/charts.js';
import { closedSeasons, currentSeason, isClosed, seasonRange } from '../seasons.js';
import { dayKeyFor, dayKeysBetween, lastNDayKeys } from '../time.js';
import { RANGE_OPTION, rangeAutocomplete, resolveRange } from './ranges.js';
import { byOption, exerciseAutocomplete, png, type CommandDef } from './types.js';

async function guildOnly(interaction: ChatInputCommandInteraction): Promise<string | null> {
  if (interaction.guildId) return interaction.guildId;
  await interaction.reply({ content: 'Run this in the server, not a DM.', flags: MessageFlags.Ephemeral });
  return null;
}

const RANGE_DESCRIPTION = 'Season or window (default: this season)';

// One bar per person in points, from the query that prices each set at its own weight.
function combinePoints(rows: TotalRow[]): { name: string; colorSlot: number; value: number }[] {
  const perUser = new Map<string, { name: string; colorSlot: number; value: number }>();
  for (const r of rows) {
    if (r.points <= 0) continue;
    const cur = perUser.get(r.userId) ?? { name: r.displayName, colorSlot: r.colorSlot, value: 0 };
    cur.value += r.points;
    perUser.set(r.userId, cur);
  }
  return [...perUser.values()];
}

const leaderboardCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Who is ahead')
    .addStringOption((o) =>
      o
        .setName('exercise')
        .setDescription('One exercise, or leave blank for combined points')
        .setRequired(false)
        .setAutocomplete(true),
    )
    .addStringOption((o) =>
      o.setName(RANGE_OPTION).setDescription(RANGE_DESCRIPTION).setRequired(false).setAutocomplete(true),
    )
    .toJSON(),
  autocomplete: byOption({ exercise: exerciseAutocomplete, [RANGE_OPTION]: rangeAutocomplete }),
  execute: async (interaction) => {
    const guildId = await guildOnly(interaction);
    if (!guildId) return;
    await interaction.deferReply();

    const key = interaction.options.getString('exercise') ?? undefined;
    const ex = key ? getExercise(key) : null;
    if (key && !ex) {
      await interaction.editReply(`No exercise called \`${key}\`.`);
      return;
    }

    const range = resolveRange(interaction.options.getString(RANGE_OPTION), guildId);
    if (!range) {
      await interaction.editReply('I do not know that season or window — pick one from the suggestions.');
      return;
    }

    let bars: { name: string; colorSlot: number; value: number }[];
    let footNote: string | undefined;

    if (!ex && range.frozen && range.season) {
      // A closed season shows its frozen board.
      bars = getSeasonStandings(range.season.id, guildId).map((r) => ({
        name: r.displayName,
        colorSlot: r.colorSlot,
        value: r.points,
      }));
      footNote = `Final standings, frozen when ${range.season.label} closed`;
    } else {
      const rows = rangeTotals(guildId, range.fromKey, range.toKey, ex?.key);
      // A weighted exercise ranks in points.
      bars = ex
        ? rows.map((r) => ({ name: r.displayName, colorSlot: r.colorSlot, value: ex && scoredInPoints(ex) ? r.points : r.total }))
        : combinePoints(rows);
      if (range.season && isClosed(range.season)) {
        footNote = 'Recounted from the log — only the season points board is frozen';
      }
    }

    if (bars.length === 0) {
      await interaction.editReply('Nothing logged for that yet.');
      return;
    }

    const inPoints = !ex || scoredInPoints(ex);
    const image = await renderLeaderboard({
      title: ex ? ex.label : 'Points leaderboard',
      subtitle: !ex
        ? `${range.label} — points across every exercise`
        : inPoints
          ? `${range.label} — points, so the weight counts`
          : range.label,
      bars,
      unit: (inPoints ? 'pts' : ex!.unit) as Metric,
      footNote,
    });
    await interaction.editReply({ files: [png(image, 'leaderboard.png')] });
  },
};

const raceCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('race')
    .setDescription('Running totals over time')
    .addStringOption((o) =>
      o.setName('exercise').setDescription('One exercise, or blank for everything').setRequired(false).setAutocomplete(true),
    )
    .addStringOption((o) =>
      o.setName(RANGE_OPTION).setDescription(RANGE_DESCRIPTION).setRequired(false).setAutocomplete(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('days')
        .setDescription('A rolling window instead of a season — overrides the range')
        .setRequired(false)
        .setMinValue(3)
        .setMaxValue(180),
    )
    .addBooleanOption((o) =>
      o.setName('daily').setDescription('Show per-day values instead of running totals').setRequired(false),
    )
    .toJSON(),
  autocomplete: byOption({ exercise: exerciseAutocomplete, [RANGE_OPTION]: rangeAutocomplete }),
  execute: async (interaction) => {
    const guildId = await guildOnly(interaction);
    if (!guildId) return;
    await interaction.deferReply();

    const key = interaction.options.getString('exercise') ?? undefined;
    const ex = key ? getExercise(key) : null;
    if (key && !ex) {
      await interaction.editReply(`No exercise called \`${key}\`.`);
      return;
    }

    const cumulative = !(interaction.options.getBoolean('daily') ?? false);
    const days = interaction.options.getInteger('days');

    // An explicit day count wins over a range.
    let fromKey: string;
    let toKey: string;
    let windowLabel: string;
    if (days) {
      const window = lastNDayKeys(days);
      fromKey = window[0]!;
      toKey = window[window.length - 1]!;
      windowLabel = `last ${days} days`;
    } else {
      const range = resolveRange(interaction.options.getString(RANGE_OPTION), guildId);
      if (!range) {
        await interaction.editReply('I do not know that season or window — pick one from the suggestions.');
        return;
      }
      fromKey = range.fromKey;
      toKey = range.toKey;
      windowLabel = range.label;
    }

    const dayKeys = dayKeysBetween(fromKey, toKey);
    // No exercise: a points race; one exercise: its own unit.
    const points = dailySeries(guildId, fromKey, toKey, ex?.key);

    if (points.length === 0) {
      await interaction.editReply('Nothing logged in that window yet.');
      return;
    }

    const image = await renderTrend({
      title: ex ? `${ex.label} ${cumulative ? 'race' : 'per day'}` : `Points ${cumulative ? 'race' : 'per day'}`,
      subtitle: `${cumulative ? 'Running total' : 'Daily values'}, ${windowLabel}`,
      dayKeys,
      points,
      unit: (ex && !scoredInPoints(ex) ? ex.unit : 'pts') as Metric,
      cumulative,
    });
    await interaction.editReply({ files: [png(image, 'race.png')] });
  },
};

const meCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('me')
    .setDescription('Your card — this season and career')
    .addUserOption((o) => o.setName('user').setDescription('Look up someone else').setRequired(false))
    .toJSON(),
  execute: async (interaction) => {
    const guildId = await guildOnly(interaction);
    if (!guildId) return;
    await interaction.deferReply();

    const target = interaction.options.getUser('user') ?? interaction.user;
    const user = getUser(target.id);
    if (!user) {
      await interaction.editReply(`${target.displayName || target.username} has not logged anything yet.`);
      return;
    }

    const exercises = listExercises();
    const repKeys = exercises.filter((e) => e.unit === 'reps').map((e) => e.key);
    const rows = allTimeTotals(guildId).filter((r) => r.userId === user.id);

    const season = currentSeason();
    const mine = scoreboard(guildId, season.startDay, dayKeyFor()).find((r) => r.userId === user.id);

    const image = await renderPersonalCard({
      name: user.displayName,
      colorSlot: user.colorSlot,
      totalReps: rows.filter((r) => repKeys.includes(r.exerciseKey)).reduce((s, r) => s + r.total, 0),
      totalPoints: rows.reduce((s, r) => s + r.points, 0),
      seasonPoints: mine?.points ?? 0,
      seasonLabel: season.label,
      seasonNote: seasonRange(season),
      daysLogged: daysLogged(guildId, user.id),
      streak: currentStreak(guildId, user.id, dayKeyFor()),
      bestDay: bestDayForUser(guildId, user.id),
      perExercise: exercises.map((e) => {
        const row = rows.find((r) => r.exerciseKey === e.key);
        return { label: e.label, unit: e.unit, total: row?.total ?? 0, points: row?.points ?? 0 };
      }),
    });
    await interaction.editReply({ files: [png(image, 'card.png')] });
  },
};

const seasonsCommand: CommandDef = {
  data: new SlashCommandBuilder().setName('seasons').setDescription('Past season champions').toJSON(),
  execute: async (interaction) => {
    const guildId = await guildOnly(interaction);
    if (!guildId) return;
    await interaction.deferReply();

    const finished = closedSeasons();
    if (finished.length === 0) {
      const season = currentSeason();
      await interaction.editReply(
        `No season has finished yet. **${season.label}** runs ${seasonRange(season)} — the champion gets posted here when it closes.`,
      );
      return;
    }

    const image = await renderHallOfFame({
      seasons: finished.map((season) => {
        const frozen = getSeasonStandings(season.id, guildId);
        const board: StandingRow[] =
          frozen.length > 0 ? frozen : scoreboard(guildId, season.startDay, season.endDay);
        const ranked = [...board].filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
        const top = ranked[0]?.points ?? 0;
        const champions = ranked.filter((r) => samePoints(r.points, top));
        const runnerUp = ranked.find((r) => !samePoints(r.points, top) && r.points < top) ?? null;
        return {
          label: season.label,
          range: seasonRange(season),
          champions: champions.map((c) => ({ name: c.displayName, colorSlot: c.colorSlot, points: c.points })),
          runnerUp: runnerUp ? { name: runnerUp.displayName, points: runnerUp.points } : null,
          athletes: ranked.length,
          frozen: frozen.length > 0,
        };
      }),
    });
    await interaction.editReply({ files: [png(image, 'seasons.png')] });
  },
};

const nameCommand: CommandDef = {
  data: new SlashCommandBuilder()
    .setName('name')
    .setDescription('Set the name shown on charts')
    .addStringOption((o) =>
      o.setName('display').setDescription('What to call you').setRequired(true).setMaxLength(32),
    )
    .addUserOption((o) =>
      o.setName('user').setDescription('Change someone else (needs Manage Server)').setRequired(false),
    )
    .toJSON(),
  execute: async (interaction) => {
    const guildId = await guildOnly(interaction);
    if (!guildId) return;

    const display = interaction.options.getString('display', true).trim();
    if (!display) {
      await interaction.reply({ content: 'That name is empty.', flags: MessageFlags.Ephemeral });
      return;
    }

    const other = interaction.options.getUser('user');
    if (other && other.id !== interaction.user.id) {
      // Only gate the cross-user case; everyone may rename themselves.
      const perms = interaction.memberPermissions;
      if (!perms?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: 'Renaming someone else needs Manage Server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    const target = other ?? interaction.user;
    const before = getUser(target.id);
    ensureUser(target.id, display);
    setDisplayName(target.id, display);

    await interaction.reply(
      before && before.displayName !== display
        ? `**${before.displayName}** now shows as **${display}** on charts.`
        : `Charts will show **${display}**.`,
    );
  },
};

export function statsCommands(): CommandDef[] {
  return [leaderboardCommand, raceCommand, meCommand, seasonsCommand, nameCommand];
}
