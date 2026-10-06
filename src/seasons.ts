// Seasons are date ranges derived from a rule; an entry stores only its day key.
import { DateTime } from 'luxon';
import { db } from './db/index.js';
import { dayKeyFor, formatMonthDay } from './time.js';

export interface Season {
  id: number;
  label: string;
  // Inclusive, in fitness-day keys.
  startDay: string;
  endDay: string;
}

// Season 1 starts at the first logged day; every later season is two calendar months.
const SEASON_ONE = { startDay: '2026-07-18', endDay: '2026-09-30' } as const;
const REGULAR_START = '2026-10-01';
const MONTHS_PER_SEASON = 2;

// The rule; rows in the seasons table win over it.
function derive(id: number): Season {
  if (id <= 1) return { id: 1, label: 'Season 1', ...SEASON_ONE };
  const start = DateTime.fromISO(REGULAR_START).plus({ months: MONTHS_PER_SEASON * (id - 2) });
  const end = start.plus({ months: MONTHS_PER_SEASON }).minus({ days: 1 });
  return { id, label: `Season ${id}`, startDay: start.toISODate()!, endDay: end.toISODate()! };
}

function deriveIdForDay(dayKey: string): number {
  if (dayKey <= SEASON_ONE.endDay) return 1;
  const months = DateTime.fromISO(dayKey).diff(DateTime.fromISO(REGULAR_START), 'months').months;
  return 2 + Math.floor(Math.max(0, months) / MONTHS_PER_SEASON);
}

interface SeasonRow {
  id: number;
  label: string;
  start_day: string;
  end_day: string;
}

const toSeason = (r: SeasonRow): Season => ({
  id: r.id,
  label: r.label,
  startDay: r.start_day,
  endDay: r.end_day,
});

/** Materialises every season through the one containing dayKey (INSERT OR IGNORE keeps hand edits). */
function ensureSeasonsThrough(dayKey: string): void {
  const highest = deriveIdForDay(dayKey);
  const insert = db().prepare(
    'INSERT OR IGNORE INTO seasons (id, label, start_day, end_day) VALUES (?, ?, ?, ?)',
  );
  const fill = db().transaction(() => {
    for (let id = 1; id <= highest; id++) {
      const s = derive(id);
      insert.run(s.id, s.label, s.startDay, s.endDay);
    }
  });
  fill();
}

/** The season the rule gives for a day, without creating rows (a stored row would freeze a boundary). */
export function seasonRuleFor(dayKey: string): Season {
  return derive(deriveIdForDay(dayKey));
}

export function seasonForDay(dayKey: string): Season {
  ensureSeasonsThrough(dayKey);
  const row = db()
    .prepare('SELECT id, label, start_day, end_day FROM seasons WHERE ? BETWEEN start_day AND end_day')
    .get(dayKey) as SeasonRow | undefined;
  // A day before Season 1 (an older backfill) is Season 1.
  return row ? toSeason(row) : derive(deriveIdForDay(dayKey));
}

export function currentSeason(): Season {
  return seasonForDay(dayKeyFor());
}

/** Newest first, including the season in progress. */
export function listSeasons(): Season[] {
  ensureSeasonsThrough(dayKeyFor());
  return (
    db().prepare('SELECT id, label, start_day, end_day FROM seasons ORDER BY id DESC').all() as SeasonRow[]
  ).map(toSeason);
}

/** A season is closed once its last fitness day has passed (the cutoff is in the day key). */
export function isClosed(season: Season, todayKey = dayKeyFor()): boolean {
  return season.endDay < todayKey;
}

export function closedSeasons(todayKey = dayKeyFor()): Season[] {
  return listSeasons().filter((s) => isClosed(s, todayKey));
}

export function getSeason(id: number): Season | null {
  ensureSeasonsThrough(dayKeyFor());
  const row = db()
    .prepare('SELECT id, label, start_day, end_day FROM seasons WHERE id = ?')
    .get(id) as SeasonRow | undefined;
  return row ? toSeason(row) : null;
}

/** "Jul 18 – Sep 30" */
export function seasonRange(season: Season): string {
  return `${formatMonthDay(season.startDay)} – ${formatMonthDay(season.endDay)}`;
}
