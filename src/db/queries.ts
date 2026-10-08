import { DateTime } from 'luxon';
import { canonName, type Unit, type WeightMode } from '../exercises.js';
import {
  SCORING,
  buildCurve,
  legacyCurve,
  parsePricing,
  pricingColumns,
  pricingValid,
  type PricingSpec,
} from '../scoring.js';
import { BW_MAX, BW_MIN, inBodyweightRange } from '../strengthLevelTables.js';
import { previousDayKey } from '../time.js';
import { db, invalidateScoring } from './index.js';

export interface UserRow {
  id: string;
  displayName: string;
  colorSlot: number;
}

export interface ExerciseRow {
  key: string;
  label: string;
  unit: Unit;
  sortOrder: number;
  // Display price derived from the pricing record; what a rep pays is priceAt().
  pointsPerRep: number;
  // Pricing record; null scores from price x weight / reference weight.
  pricing: PricingSpec | null;
  // Null for a plain counted exercise.
  refWeight: number | null;
  weightMode: WeightMode;
  weightNote: string | null;
  // Logged with /new and unpriced: scores 0.
  pending: boolean;
}

export function scoredInPoints(ex: Pick<ExerciseRow, 'refWeight'>): boolean {
  return ex.refWeight !== null;
}

export interface TotalRow {
  userId: string;
  displayName: string;
  colorSlot: number;
  exerciseKey: string;
  // The exercise's own unit (reps, miles, minutes).
  total: number;
  points: number;
}

export interface EntryRow {
  id: number;
  userId: string;
  exerciseKey: string;
  dayKey: string;
  amount: number;
  weight: number | null;
}

/** SQL for one entry's points (e = entries); calls the registered entry_points function. */
export const POINTS_SQL = 'entry_points(e.exercise_key, e.amount, e.weight, e.user_id)';

/** Price per rep at a logged weight (null = none) for a person of that body weight. */
export function priceAt(
  ex: Pick<ExerciseRow, 'pricing' | 'pointsPerRep' | 'refWeight' | 'weightMode'>,
  weight: number | null,
  bodyLb: number = SCORING.BODY_LB,
): number {
  const curve = ex.pricing ? buildCurve(ex.pricing, bodyLb) : legacyCurve(ex.pointsPerRep, ex.refWeight, ex.weightMode);
  return curve(weight);
}

/** The body weight set with /weight, or null. */
export function getUserWeight(userId: string): number | null {
  const r = db().prepare('SELECT weight_lb FROM user_weight WHERE user_id = ?').get(userId) as { weight_lb: number } | undefined;
  return r ? r.weight_lb : null;
}

/** Body weight used for scoring: the set value, else 150. */
export function bodyWeightOf(userId: string): number {
  return getUserWeight(userId) ?? SCORING.BODY_LB;
}

/** Sets a body weight; throws RangeError outside 110-310 lb. Logged append-only. */
export function setUserWeight(userId: string, lb: number): void {
  if (!inBodyweightRange(lb)) {
    throw new RangeError(`Body weight must be between ${BW_MIN} and ${BW_MAX} lb (the range of Strength Level's standards).`);
  }
  const conn = db();
  const now = DateTime.utc().toISO();
  conn.transaction(() => {
    conn
      .prepare(
        `INSERT INTO user_weight (user_id, weight_lb, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET weight_lb = excluded.weight_lb, updated_at = excluded.updated_at`,
      )
      .run(userId, lb, now);
    conn.prepare('INSERT INTO user_weight_log (user_id, weight_lb, set_at) VALUES (?, ?, ?)').run(userId, lb, now);
  })();
  invalidateScoring();
}

/** Clears the weight (logged as NULL); returns whether one was set. */
export function clearUserWeight(userId: string): boolean {
  const conn = db();
  const had = conn.transaction(() => {
    const changed = conn.prepare('DELETE FROM user_weight WHERE user_id = ?').run(userId).changes > 0;
    if (changed) conn.prepare('INSERT INTO user_weight_log (user_id, weight_lb, set_at) VALUES (?, NULL, ?)').run(userId, DateTime.utc().toISO());
    return changed;
  })();
  invalidateScoring();
  return had;
}

/** Every stored weight, and the change log (read by scripts/inspect-db.ts). */
export function listUserWeights(): { userId: string; name: string | null; weightLb: number; updatedAt: string }[] {
  return (
    db()
      .prepare(
        `SELECT w.user_id, u.display_name, w.weight_lb, w.updated_at FROM user_weight w
         LEFT JOIN users u ON u.id = w.user_id ORDER BY w.updated_at`,
      )
      .all() as { user_id: string; display_name: string | null; weight_lb: number; updated_at: string }[]
  ).map((r) => ({ userId: r.user_id, name: r.display_name, weightLb: r.weight_lb, updatedAt: r.updated_at }));
}

export function userWeightLog(): { id: number; userId: string; name: string | null; weightLb: number | null; setAt: string }[] {
  return (
    db()
      .prepare(
        `SELECT l.id, l.user_id, u.display_name, l.weight_lb, l.set_at FROM user_weight_log l
         LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id`,
      )
      .all() as { id: number; user_id: string; display_name: string | null; weight_lb: number | null; set_at: string }[]
  ).map((r) => ({ id: r.id, userId: r.user_id, name: r.display_name, weightLb: r.weight_lb, setAt: r.set_at }));
}

const EXERCISE_COLS =
  'key, label, unit, sort_order, points_per_rep, ref_weight, weight_mode, weight_note, pending, pricing';

interface RawExercise {
  key: string;
  label: string;
  unit: Unit;
  sort_order: number;
  points_per_rep: number;
  ref_weight: number | null;
  weight_mode: WeightMode;
  weight_note: string | null;
  pending: number;
  pricing: string | null;
}

function toExercise(r: RawExercise): ExerciseRow {
  return {
    key: r.key,
    label: r.label,
    unit: r.unit,
    sortOrder: r.sort_order,
    pointsPerRep: r.points_per_rep,
    pricing: parsePricing(r.pricing),
    refWeight: r.ref_weight,
    weightMode: r.weight_mode,
    weightNote: r.weight_note,
    pending: r.pending === 1,
  };
}

export function ensureUser(id: string, displayName: string): UserRow {
  const conn = db();
  const existing = conn.prepare('SELECT id, display_name, color_slot FROM users WHERE id = ?').get(id) as
    | { id: string; display_name: string; color_slot: number }
    | undefined;

  // The name is set once and changed only via /name.
  if (existing) {
    return { id, displayName: existing.display_name, colorSlot: existing.color_slot };
  }

  const next = conn.prepare('SELECT COALESCE(MAX(color_slot) + 1, 0) AS n FROM users').get() as { n: number };
  conn
    .prepare('INSERT INTO users (id, display_name, color_slot, first_seen) VALUES (?, ?, ?, ?)')
    .run(id, displayName, next.n, DateTime.utc().toISO());
  return { id, displayName, colorSlot: next.n };
}

export function setDisplayName(id: string, displayName: string): boolean {
  return db().prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, id).changes > 0;
}

export function getUser(id: string): UserRow | null {
  const row = db().prepare('SELECT id, display_name, color_slot FROM users WHERE id = ?').get(id) as
    | { id: string; display_name: string; color_slot: number }
    | undefined;
  return row ? { id: row.id, displayName: row.display_name, colorSlot: row.color_slot } : null;
}

export function listExercises(): ExerciseRow[] {
  return (
    db()
      .prepare(`SELECT ${EXERCISE_COLS} FROM exercises WHERE active = 1 ORDER BY sort_order, key`)
      .all() as RawExercise[]
  ).map(toExercise);
}

export function getExercise(key: string): ExerciseRow | null {
  const r = db().prepare(`SELECT ${EXERCISE_COLS} FROM exercises WHERE key = ? AND active = 1`).get(key) as
    | RawExercise
    | undefined;
  return r ? toExercise(r) : null;
}

export function addExercise(key: string, label: string, unit: Unit, pointsPerRep: number): ExerciseRow {
  const conn = db();
  const next = conn.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM exercises').get() as { n: number };
  conn
    .prepare(
      `INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep) VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET label = excluded.label, unit = excluded.unit, active = 1,
                                      points_per_rep = excluded.points_per_rep`,
    )
    .run(key, label, unit, next.n, pointsPerRep);
  invalidateScoring();
  return getExercise(key)!;
}

export function removeExercise(key: string): boolean {
  const changed = db().prepare('UPDATE exercises SET active = 0 WHERE key = ?').run(key).changes > 0;
  invalidateScoring();
  return changed;
}

export const PENDING_SUFFIX = ' (pending)';
export const MAX_PENDING = 30;

export function baseLabel(ex: Pick<ExerciseRow, 'label'>): string {
  return ex.label.endsWith(PENDING_SUFFIX) ? ex.label.slice(0, -PENDING_SUFFIX.length) : ex.label;
}

/** An exercise already using this name (active, retired or queued), compared ignoring case, spaces, hyphens and a plural s. */
export function findSimilarExercise(name: string): { exercise: ExerciseRow; active: boolean } | null {
  const wanted = canonName(name);
  if (!wanted) return null;
  const rows = db().prepare(`SELECT ${EXERCISE_COLS}, active FROM exercises`).all() as (RawExercise & {
    active: number;
  })[];
  const hit = rows.find((r) => canonName(r.key) === wanted || canonName(baseLabel(r)) === wanted);
  return hit ? { exercise: toExercise(hit), active: hit.active === 1 } : null;
}

export function countPending(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM exercises WHERE pending = 1').get() as { n: number }).n;
}

/** An unpriced exercise: 0 points, reps, no weight rule. */
export function createPendingExercise(key: string, name: string, note: string | null = null): ExerciseRow {
  const conn = db();
  const next = conn.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM exercises').get() as { n: number };
  conn
    .prepare(
      `INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep, weight_mode, weight_note, pending)
       VALUES (?, ?, 'reps', ?, 1, 0, 'load', ?, 1)`,
    )
    .run(key, name + PENDING_SUFFIX, next.n, note);
  invalidateScoring();
  return getExercise(key)!;
}

export function addPendingNote(key: string, note: string): void {
  db()
    .prepare(
      `UPDATE exercises SET weight_note = CASE
           WHEN weight_note IS NULL THEN ?
           WHEN instr(weight_note, ?) > 0 THEN weight_note
           ELSE substr(weight_note || '; ' || ?, 1, 300) END
       WHERE key = ? AND pending = 1`,
    )
    .run(note, note, note, key);
}

export interface PendingSummary {
  exercise: ExerciseRow;
  logs: number;
  reps: number;
  people: string[];
  minWeight: number | null;
  maxWeight: number | null;
  firstDay: string | null;
  lastDay: string | null;
}

export function listPending(guildId: string): PendingSummary[] {
  const conn = db();
  const rows = conn
    .prepare(
      `SELECT x.key, COUNT(e.id) AS logs, COALESCE(SUM(e.amount), 0) AS reps,
              MIN(e.weight) AS minw, MAX(e.weight) AS maxw, MIN(e.day_key) AS first, MAX(e.day_key) AS last
       FROM exercises x LEFT JOIN entries e ON e.exercise_key = x.key AND e.guild_id = ?
       WHERE x.pending = 1 GROUP BY x.key ORDER BY MIN(x.sort_order)`,
    )
    .all(guildId) as {
    key: string;
    logs: number;
    reps: number;
    minw: number | null;
    maxw: number | null;
    first: string | null;
    last: string | null;
  }[];
  const who = conn.prepare(
    `SELECT DISTINCT u.display_name AS name FROM entries e JOIN users u ON u.id = e.user_id
     WHERE e.exercise_key = ? AND e.guild_id = ? ORDER BY u.display_name`,
  );
  return rows.map((r) => ({
    exercise: getExercise(r.key)!,
    logs: r.logs,
    reps: r.reps,
    people: (who.all(r.key, guildId) as { name: string }[]).map((p) => p.name),
    minWeight: r.minw,
    maxWeight: r.maxw,
    firstDay: r.first,
    lastDay: r.last,
  }));
}

export interface ApproveSpec {
  label: string;
  pricing: PricingSpec;
  note?: string | null;
  // The key (and so the slash command) the exercise ends up with; players type the queued key, so it is often not the one wanted.
  newKey?: string;
}

/** A key the slash command can use: lowercase letters, digits and hyphens, up to 32. */
export const KEY_PATTERN = /^[a-z0-9-]{1,32}$/;

/** Prices a pending exercise, optionally under a new key; entries need no backfill because points are computed from the row. */
export function approveExercise(key: string, spec: ApproveSpec): ExerciseRow | null {
  if (!pricingValid(spec.pricing)) {
    throw new Error('pricing must be a flat price >= 0, four positive 1RM anchors, or a bodyweight curve');
  }
  const newKey = spec.newKey !== undefined && spec.newKey !== key ? spec.newKey : null;
  if (newKey !== null && !KEY_PATTERN.test(newKey)) {
    throw new Error('the new key must be lowercase letters, digits and hyphens (up to 32), so it can be a slash command');
  }
  // ref_weight and weight_mode tell the slash command what to ask for; points_per_rep is display only.
  const cols = pricingColumns(spec.pricing);
  const conn = db();
  const run = conn.transaction((): boolean => {
    if (newKey !== null && conn.prepare('SELECT 1 FROM exercises WHERE key = ?').get(newKey) !== undefined) {
      throw new Error(`"${newKey}" is already an exercise key`);
    }
    const changed = conn
      .prepare(
        `UPDATE exercises SET label = ?, points_per_rep = ?, ref_weight = ?, weight_mode = ?, weight_note = ?, pricing = ?, pending = 0
         WHERE key = ? AND pending = 1`,
      )
      .run(spec.label, cols.display, cols.ref, cols.mode, spec.note ?? null, cols.json, key).changes;
    if (changed === 0) return false;
    if (newKey !== null) {
      // The key is a foreign key target: copy the row, repoint the entries, drop the old row.
      conn
        .prepare(
          `INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep, ref_weight, weight_mode, weight_note, pending, pricing)
           SELECT ?, label, unit, sort_order, active, points_per_rep, ref_weight, weight_mode, weight_note, pending, pricing FROM exercises WHERE key = ?`,
        )
        .run(newKey, key);
      conn.prepare('UPDATE entries SET exercise_key = ? WHERE exercise_key = ?').run(newKey, key);
      conn.prepare('DELETE FROM exercises WHERE key = ?').run(key);
    }
    return true;
  });
  const approved = run();
  invalidateScoring();
  return approved ? getExercise(newKey ?? key) : null;
}

/** Moves a pending exercise's entries into an existing one; returns how many moved, or null for an invalid pair. */
export function mergeExercise(from: string, into: string): number | null {
  const conn = db();
  const run = conn.transaction((): number | null => {
    const src = conn.prepare('SELECT pending FROM exercises WHERE key = ?').get(from) as { pending: number } | undefined;
    const dst = conn.prepare('SELECT pending, active FROM exercises WHERE key = ?').get(into) as
      | { pending: number; active: number }
      | undefined;
    if (from === into || !src || src.pending !== 1 || !dst || dst.pending === 1 || dst.active !== 1) return null;
    const moved = conn.prepare('UPDATE entries SET exercise_key = ? WHERE exercise_key = ?').run(into, from).changes;
    conn.prepare('DELETE FROM exercises WHERE key = ?').run(from);
    return moved;
  });
  const moved = run();
  invalidateScoring();
  return moved;
}

export function addEntry(
  guildId: string,
  userId: string,
  exerciseKey: string,
  dayKey: string,
  amount: number,
  weight: number | null = null,
): void {
  db()
    .prepare(
      `INSERT INTO entries (guild_id, user_id, exercise_key, day_key, amount, created_at, weight)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(guildId, userId, exerciseKey, dayKey, amount, DateTime.utc().toISO(), weight);
}

export function recentUsage(guildId: string, userId: string, sinceKey: string): Map<string, number> {
  const rows = db()
    .prepare(
      `SELECT exercise_key, COUNT(*) AS n FROM entries
       WHERE guild_id = ? AND user_id = ? AND day_key >= ? GROUP BY exercise_key`,
    )
    .all(guildId, userId, sinceKey) as { exercise_key: string; n: number }[];
  return new Map(rows.map((r) => [r.exercise_key, r.n]));
}

/** Deletes and returns the latest entry for a user and day, optionally for one exercise. */
export function undoLastEntry(
  guildId: string,
  userId: string,
  dayKey: string,
  exerciseKey?: string,
): EntryRow | null {
  const conn = db();
  const row = conn
    .prepare(
      `SELECT id, user_id, exercise_key, day_key, amount, weight FROM entries
       WHERE guild_id = ? AND user_id = ? AND day_key = ?
         AND (? IS NULL OR exercise_key = ?)
       ORDER BY id DESC LIMIT 1`,
    )
    .get(guildId, userId, dayKey, exerciseKey ?? null, exerciseKey ?? null) as
    | { id: number; user_id: string; exercise_key: string; day_key: string; amount: number; weight: number | null }
    | undefined;
  if (!row) return null;

  conn.prepare('DELETE FROM entries WHERE id = ?').run(row.id);
  return {
    id: row.id,
    userId: row.user_id,
    exerciseKey: row.exercise_key,
    dayKey: row.day_key,
    amount: row.amount,
    weight: row.weight,
  };
}

/** Replaces a day's total for one exercise. */
export function setDayTotal(
  guildId: string,
  userId: string,
  exerciseKey: string,
  dayKey: string,
  amount: number,
): void {
  const conn = db();
  const replace = conn.transaction(() => {
    conn
      .prepare('DELETE FROM entries WHERE guild_id = ? AND user_id = ? AND exercise_key = ? AND day_key = ?')
      .run(guildId, userId, exerciseKey, dayKey);
    if (amount > 0) addEntry(guildId, userId, exerciseKey, dayKey, amount);
  });
  replace();
}

export function dayTotals(guildId: string, dayKey: string): TotalRow[] {
  return (
    db()
      .prepare(
        `SELECT e.user_id, u.display_name, u.color_slot, e.exercise_key, SUM(e.amount) AS total,
                SUM(${POINTS_SQL}) AS points
         FROM entries e JOIN users u ON u.id = e.user_id
         JOIN exercises x ON x.key = e.exercise_key
         WHERE e.guild_id = ? AND e.day_key = ?
         GROUP BY e.user_id, e.exercise_key
         HAVING total > 0
         ORDER BY total DESC`,
      )
      .all(guildId, dayKey) as RawTotal[]
  ).map(toTotalRow);
}

export function allTimeTotals(guildId: string, exerciseKey?: string): TotalRow[] {
  return (
    db()
      .prepare(
        `SELECT e.user_id, u.display_name, u.color_slot, e.exercise_key, SUM(e.amount) AS total,
                SUM(${POINTS_SQL}) AS points
         FROM entries e JOIN users u ON u.id = e.user_id
         JOIN exercises x ON x.key = e.exercise_key
         WHERE e.guild_id = ? AND (? IS NULL OR e.exercise_key = ?)
         GROUP BY e.user_id, e.exercise_key
         HAVING total > 0
         ORDER BY total DESC`,
      )
      .all(guildId, exerciseKey ?? null, exerciseKey ?? null) as RawTotal[]
  ).map(toTotalRow);
}

export function rangeTotals(guildId: string, fromKey: string, toKey: string, exerciseKey?: string): TotalRow[] {
  return (
    db()
      .prepare(
        `SELECT e.user_id, u.display_name, u.color_slot, e.exercise_key, SUM(e.amount) AS total,
                SUM(${POINTS_SQL}) AS points
         FROM entries e JOIN users u ON u.id = e.user_id
         JOIN exercises x ON x.key = e.exercise_key
         WHERE e.guild_id = ? AND e.day_key BETWEEN ? AND ?
           AND (? IS NULL OR e.exercise_key = ?)
         GROUP BY e.user_id, e.exercise_key
         HAVING total > 0
         ORDER BY total DESC`,
      )
      .all(guildId, fromKey, toKey, exerciseKey ?? null, exerciseKey ?? null) as RawTotal[]
  ).map(toTotalRow);
}

export interface DailyPoint {
  userId: string;
  displayName: string;
  colorSlot: number;
  dayKey: string;
  total: number;
}

/** Daily points per user; with one plain exercise selected, its own unit. */
export function dailySeries(
  guildId: string,
  fromKey: string,
  toKey: string,
  exerciseKey?: string,
): DailyPoint[] {
  // A weighted exercise is always points; a plain single exercise uses the raw count.
  const single = exerciseKey ? getExercise(exerciseKey) : null;
  const value = single && !scoredInPoints(single) ? 'SUM(e.amount)' : `SUM(${POINTS_SQL})`;
  return (
    db()
      .prepare(
        `SELECT e.user_id, u.display_name, u.color_slot, e.day_key, ${value} AS total
         FROM entries e
         JOIN users u ON u.id = e.user_id
         JOIN exercises x ON x.key = e.exercise_key
         WHERE e.guild_id = ? AND e.day_key BETWEEN ? AND ?
           AND (? IS NULL OR e.exercise_key = ?)
         GROUP BY e.user_id, e.day_key
         ORDER BY e.day_key ASC`,
      )
      .all(guildId, fromKey, toKey, exerciseKey ?? null, exerciseKey ?? null) as {
      user_id: string;
      display_name: string;
      color_slot: number;
      day_key: string;
      total: number;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    colorSlot: r.color_slot,
    dayKey: r.day_key,
    total: r.total,
  }));
}

/** Consecutive days logged back from todayKey; an empty today does not break the streak. */
export function currentStreak(guildId: string, userId: string, todayKey: string): number {
  const days = new Set(
    (
      db()
        .prepare('SELECT DISTINCT day_key FROM entries WHERE guild_id = ? AND user_id = ?')
        .all(guildId, userId) as { day_key: string }[]
    ).map((r) => r.day_key),
  );

  let cursor = days.has(todayKey) ? todayKey : previousDayKey(todayKey);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

export function bestDayForUser(guildId: string, userId: string): { dayKey: string; total: number } | null {
  const row = db()
    .prepare(
      `SELECT e.day_key, SUM(${POINTS_SQL}) AS total
       FROM entries e JOIN exercises x ON x.key = e.exercise_key
       WHERE e.guild_id = ? AND e.user_id = ?
       GROUP BY e.day_key HAVING total > 0 ORDER BY total DESC LIMIT 1`,
    )
    .get(guildId, userId) as { day_key: string; total: number } | undefined;
  return row ? { dayKey: row.day_key, total: row.total } : null;
}

export function activeDayCount(guildId: string): number {
  const r = db()
    .prepare('SELECT COUNT(DISTINCT day_key) AS n FROM entries WHERE guild_id = ?')
    .get(guildId) as { n: number };
  return r.n;
}

export function daysLogged(guildId: string, userId: string): number {
  const r = db()
    .prepare('SELECT COUNT(DISTINCT day_key) AS n FROM entries WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as { n: number };
  return r.n;
}

export interface StandingRow {
  userId: string;
  displayName: string;
  colorSlot: number;
  points: number;
  // Rep-unit exercises only.
  reps: number;
  days: number;
}

/** One row per person for a date range (a season board and its frozen snapshot). */
export function scoreboard(guildId: string, fromKey: string, toKey: string): StandingRow[] {
  return (
    db()
      .prepare(
        `SELECT e.user_id, u.display_name, u.color_slot,
                SUM(${POINTS_SQL}) AS points,
                SUM(CASE WHEN x.unit = 'reps' THEN e.amount ELSE 0 END) AS reps,
                COUNT(DISTINCT e.day_key) AS days
         FROM entries e
         JOIN users u ON u.id = e.user_id
         JOIN exercises x ON x.key = e.exercise_key
         WHERE e.guild_id = ? AND e.day_key BETWEEN ? AND ?
         GROUP BY e.user_id
         ORDER BY points DESC`,
      )
      .all(guildId, fromKey, toKey) as {
      user_id: string;
      display_name: string;
      color_slot: number;
      points: number;
      reps: number;
      days: number;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    colorSlot: r.color_slot,
    points: r.points,
    reps: r.reps,
    days: r.days,
  }));
}

export function firstEntryDay(guildId: string): string | null {
  const r = db()
    .prepare('SELECT MIN(day_key) AS d FROM entries WHERE guild_id = ?')
    .get(guildId) as { d: string | null };
  return r.d;
}

export function getSeasonStandings(seasonId: number, guildId: string): StandingRow[] {
  return (
    db()
      .prepare(
        `SELECT user_id, display_name, color_slot, points, reps, days
         FROM season_standings WHERE season_id = ? AND guild_id = ?
         ORDER BY points DESC`,
      )
      .all(seasonId, guildId) as {
      user_id: string;
      display_name: string;
      color_slot: number;
      points: number;
      reps: number;
      days: number;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    colorSlot: r.color_slot,
    points: r.points,
    reps: r.reps,
    days: r.days,
  }));
}

export function hasSeasonStandings(seasonId: number, guildId: string): boolean {
  const r = db()
    .prepare('SELECT COUNT(*) AS n FROM season_standings WHERE season_id = ? AND guild_id = ?')
    .get(seasonId, guildId) as { n: number };
  return r.n > 0;
}

/** Freezes a closed season's board; INSERT OR IGNORE so a frozen season is never restated. */
export function saveSeasonStandings(seasonId: number, guildId: string, rows: StandingRow[]): void {
  const conn = db();
  const insert = conn.prepare(
    `INSERT OR IGNORE INTO season_standings
       (season_id, guild_id, user_id, display_name, color_slot, points, reps, days, frozen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  const save = conn.transaction(() => {
    for (const r of rows) {
      insert.run(seasonId, guildId, r.userId, r.displayName, r.colorSlot, r.points, r.reps, r.days, now);
    }
  });
  save();
}

export interface GuildConfig {
  guildId: string;
  recapChannelId: string | null;
  recapTime: string | null;
  lastRecapDay: string | null;
  lastRecapSig: string | null;
  lastClosedSeason: number | null;
}

export function getGuildConfig(guildId: string): GuildConfig {
  const r = db()
    .prepare(
      `SELECT guild_id, recap_channel_id, recap_time, last_recap_day, last_recap_sig, last_closed_season
       FROM guild_config WHERE guild_id = ?`,
    )
    .get(guildId) as
    | {
        guild_id: string;
        recap_channel_id: string | null;
        recap_time: string | null;
        last_recap_day: string | null;
        last_recap_sig: string | null;
        last_closed_season: number | null;
      }
    | undefined;
  return {
    guildId,
    recapChannelId: r?.recap_channel_id ?? null,
    recapTime: r?.recap_time ?? null,
    lastRecapDay: r?.last_recap_day ?? null,
    lastRecapSig: r?.last_recap_sig ?? null,
    lastClosedSeason: r?.last_closed_season ?? null,
  };
}

export function setGuildConfig(guildId: string, patch: Partial<Omit<GuildConfig, 'guildId'>>): void {
  const conn = db();
  conn.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
  if (patch.recapChannelId !== undefined) {
    conn.prepare('UPDATE guild_config SET recap_channel_id = ? WHERE guild_id = ?').run(patch.recapChannelId, guildId);
  }
  if (patch.recapTime !== undefined) {
    conn.prepare('UPDATE guild_config SET recap_time = ? WHERE guild_id = ?').run(patch.recapTime, guildId);
  }
  if (patch.lastRecapDay !== undefined) {
    conn.prepare('UPDATE guild_config SET last_recap_day = ? WHERE guild_id = ?').run(patch.lastRecapDay, guildId);
  }
  if (patch.lastRecapSig !== undefined) {
    conn.prepare('UPDATE guild_config SET last_recap_sig = ? WHERE guild_id = ?').run(patch.lastRecapSig, guildId);
  }
  if (patch.lastClosedSeason !== undefined) {
    conn
      .prepare('UPDATE guild_config SET last_closed_season = ? WHERE guild_id = ?')
      .run(patch.lastClosedSeason, guildId);
  }
}

interface RawTotal {
  user_id: string;
  display_name: string;
  color_slot: number;
  exercise_key: string;
  total: number;
  points: number;
}

function toTotalRow(r: RawTotal): TotalRow {
  return {
    userId: r.user_id,
    displayName: r.display_name,
    colorSlot: r.color_slot,
    exerciseKey: r.exercise_key,
    total: r.total,
    points: r.points,
  };
}

export interface DetailRow {
  userId: string;
  displayName: string;
  colorSlot: number;
  exerciseKey: string;
  // Null or 0 is a set with no load.
  weight: number | null;
  amount: number;
  points: number;
}

/** One row per person x exercise x weight for a day. */
export function dayDetails(guildId: string, dayKey: string): DetailRow[] {
  return (
    db()
      .prepare(
        `SELECT e.user_id, u.display_name, u.color_slot, e.exercise_key, e.weight,
                SUM(e.amount) AS amount, SUM(${POINTS_SQL}) AS points
         FROM entries e
         JOIN users u ON u.id = e.user_id
         JOIN exercises x ON x.key = e.exercise_key
         WHERE e.guild_id = ? AND e.day_key = ?
         GROUP BY e.user_id, e.exercise_key, e.weight
         HAVING amount > 0
         ORDER BY e.exercise_key, e.weight`,
      )
      .all(guildId, dayKey) as {
      user_id: string;
      display_name: string;
      color_slot: number;
      exercise_key: string;
      weight: number | null;
      amount: number;
      points: number;
    }[]
  ).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    colorSlot: r.color_slot,
    exerciseKey: r.exercise_key,
    weight: r.weight,
    amount: r.amount,
    points: r.points,
  }));
}
