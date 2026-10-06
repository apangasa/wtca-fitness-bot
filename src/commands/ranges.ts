// The time control shared by /leaderboard and /race: seasons and rolling windows in one live-suggested list.
import type { AutocompleteInteraction } from 'discord.js';
import { firstEntryDay, hasSeasonStandings } from '../db/queries.js';
import { currentSeason, getSeason, isClosed, listSeasons, seasonRange, type Season } from '../seasons.js';
import { dayKeyFor, lastNDayKeys } from '../time.js';

export const RANGE_OPTION = 'range';
const CURRENT = 'current';
const ALL = 'all';
const D30 = 'd30';
const D7 = 'd7';

export interface ResolvedRange {
  fromKey: string;
  toKey: string;
  // Chart subtitle, e.g. "Season 2 · Oct 1 – Nov 30".
  label: string;
  season: Season | null;
  // True when a frozen snapshot exists and replaces the live count.
  frozen: boolean;
}

function seasonLabel(season: Season, prefix = ''): string {
  return `${prefix}${season.label} · ${seasonRange(season)}`;
}

export function rangeChoices(): { name: string; value: string }[] {
  const current = currentSeason();
  const out = [{ name: `This season — ${seasonLabel(current)}`, value: CURRENT }];
  for (const s of listSeasons()) {
    if (isClosed(s)) out.push({ name: seasonLabel(s), value: `s${s.id}` });
  }
  out.push(
    { name: 'Last 30 days', value: D30 },
    { name: 'Last 7 days', value: D7 },
    { name: 'All time (every season)', value: ALL },
  );
  return out;
}

export async function rangeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const typed = interaction.options.getFocused().toLowerCase();
  const matches = rangeChoices().filter((c) => c.name.toLowerCase().includes(typed));
  await interaction.respond(matches.slice(0, 25));
}

/** Null means an unrecognised value (reported to the user). */
export function resolveRange(raw: string | null, guildId: string): ResolvedRange | null {
  const today = dayKeyFor();
  const value = (raw ?? CURRENT).trim();

  if (value === CURRENT) {
    const season = currentSeason();
    return { fromKey: season.startDay, toKey: today, label: seasonLabel(season), season, frozen: false };
  }

  if (value === ALL) {
    return {
      fromKey: firstEntryDay(guildId) ?? today,
      toKey: today,
      label: 'All time — every season',
      season: null,
      frozen: false,
    };
  }

  if (value === D30 || value === D7) {
    const days = value === D30 ? 30 : 7;
    const window = lastNDayKeys(days);
    return {
      fromKey: window[0]!,
      toKey: window[window.length - 1]!,
      label: `Last ${days} days`,
      season: null,
      frozen: false,
    };
  }

  const seasonMatch = /^s(\d+)$/.exec(value);
  if (seasonMatch) {
    const season = getSeason(Number.parseInt(seasonMatch[1]!, 10));
    if (!season) return null;
    const closed = isClosed(season, today);
    return {
      fromKey: season.startDay,
      // A season in progress has no results past today.
      toKey: closed ? season.endDay : today,
      label: seasonLabel(season),
      season,
      frozen: closed && hasSeasonStandings(season.id, guildId),
    };
  }

  return null;
}
