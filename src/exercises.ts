import { BW_REFERENCE } from './strengthLevelTables.js';

/** What an exercise counts; distances have their own units because 25yd and 25m laps differ. */
export type Unit = 'reps' | 'mi' | 'km' | 'yd' | 'm' | 'min' | 'flights' | 'jumps';

/**
 * Units a queued exercise can be priced in: reps as typed, or a cardio unit that a flat price is quoted per (docs/points-cardio.md).
 * Cardio does not follow body weight, so these are the only prices that go in without a by-bodyweight table.
 */
export const APPROVE_UNITS: readonly Unit[] = ['reps', 'mi', 'yd', 'flights', 'jumps'];

export type Metric = Unit | 'pts';

/** Reference body weight in lb (the 150 lb row of Strength Level's tables). */
export const BODY_LB = BW_REFERENCE;

/** Largest weight in lb a log or /new will take; a typo guard, not a cap. */
export const MAX_LOAD_LB = 2000;

/** Slash commands that are not exercises; an exercise key equal to one would replace it. */
export const RESERVED_COMMAND_NAMES: ReadonlySet<string> = new Set([
  'undo', 'today', 'leaderboard', 'race', 'me', 'seasons', 'name', 'recap', 'cleanup', 'new', 'queue', 'weight',
]);

/** Player-typed text made safe to print: one line, no control characters, capped. For names and notes shown outside Discord. */
export function plainText(raw: string, max = 60): string {
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** load: the logged weight; add: the logged load plus what a bodyweight rep moves; assist: body weight minus the assistance. */
export type WeightMode = 'load' | 'add' | 'assist';

export interface ExerciseSeed {
  key: string;
  label: string;
  unit: Unit;
  // Set when the exercise takes a weight; says what the weight means.
  weightNote?: string;
}

export const SEED_EXERCISES: ExerciseSeed[] = [
  // Bodyweight exercises that take an optional added load.
  { key: 'pushups', label: 'Push-ups', unit: 'reps', weightNote: 'plate on back, or vest' },
  { key: 'pullups', label: 'Pull-ups', unit: 'reps', weightNote: 'added load' },
  { key: 'chinups', label: 'Chin-ups', unit: 'reps', weightNote: 'added load' },
  { key: 'situps', label: 'Sit-ups', unit: 'reps', weightNote: 'weight held on chest' },
  { key: 'abrolls', label: 'Ab-rolls', unit: 'reps' },
  { key: 'squats', label: 'Squats', unit: 'reps', weightNote: 'added load' },
  { key: 'run', label: 'Run', unit: 'mi' },
  // Appended, so existing sort_order values are untouched.
  { key: 'calfraises', label: 'Calf-raises', unit: 'reps', weightNote: 'dumbbells combined, or a held plate' },
  { key: 'lunges', label: 'Lunges', unit: 'reps', weightNote: 'dumbbells combined' },
  { key: 'abrollsassisted', label: 'Ab-rolls (assisted)', unit: 'reps' },

  // Weighted lifts. Keys have no hyphens so command names stay Discord-legal.
  { key: 'benchpress', label: 'Bench Press', unit: 'reps', weightNote: 'bar + plates' },
  { key: 'narrowbench', label: 'Narrow Grip Bench', unit: 'reps', weightNote: 'bar + plates' },
  { key: 'dbbench', label: 'DB Bench Press', unit: 'reps', weightNote: 'both dumbbells combined' },
  { key: 'overheadpress', label: 'Overhead Press', unit: 'reps', weightNote: 'total load' },
  { key: 'legpress', label: 'Leg Press', unit: 'reps', weightNote: 'total load on the sled' },
  { key: 'latpulldown', label: 'Lat Pulldown', unit: 'reps', weightNote: 'stack setting' },
  { key: 'reversegriplatpulldown', label: 'Reverse Grip Lat Pulldown', unit: 'reps', weightNote: 'stack setting' },
  // A pulley/lever machine whose stack number is not the handle load; kept apart so it can be priced on its own.
  { key: 'machinelatpulldown', label: 'Machine Lat Pulldown', unit: 'reps', weightNote: 'stack setting' },
  { key: 'row', label: 'Row', unit: 'reps', weightNote: 'total load' },
  { key: 'deadlift', label: 'Deadlift', unit: 'reps', weightNote: 'bar + plates' },
  { key: 'rdl', label: 'Romanian Deadlift', unit: 'reps', weightNote: 'bar + plates' },
  { key: 'bicepcurls', label: 'Bicep Curls', unit: 'reps', weightNote: 'dumbbells combined, or the bar' },
  { key: 'triceppushdown', label: 'Tricep Pushdown', unit: 'reps', weightNote: 'stack setting' },
  { key: 'cableflies', label: 'Cable Flies', unit: 'reps', weightNote: 'both sides combined' },
  { key: 'lateralraise', label: 'Lateral Raise', unit: 'reps', weightNote: 'both dumbbells combined' },
  // Seated and lying machines are different lifts with their own tables (cable and standing curls are closer to lying).
  { key: 'seatedlegcurl', label: 'Seated Leg Curl', unit: 'reps', weightNote: 'machine stack setting' },
  { key: 'lyinglegcurl', label: 'Lying Leg Curl', unit: 'reps', weightNote: 'machine stack setting' },
  // Two lifts with their own Strength Level tables; neither counts body weight.
  { key: 'barbellbulgariansplitsquat', label: 'Barbell Bulgarian Split Squat', unit: 'reps', weightNote: 'bar + plates' },
  { key: 'dbbulgariansplitsquat', label: 'DB Bulgarian Split Squat', unit: 'reps', weightNote: 'both dumbbells combined' },
  { key: 'assistedpullups', label: 'Assisted Pull-ups', unit: 'reps', weightNote: 'assistance, not your weight' },
  { key: 'swim', label: 'Swim', unit: 'yd' },
  // Kneeling rope cable crunch only; ab machines need their own lift.
  { key: 'cablecrunch', label: 'Cable Crunch', unit: 'reps', weightNote: 'cable stack setting' },
  { key: 'dbrdl', label: 'DB Romanian Deadlift', unit: 'reps', weightNote: 'both dumbbells combined' },
  { key: 'barbellpreachercurl', label: 'Barbell Preacher Curl', unit: 'reps', weightNote: 'bar + plates' },
  // One arm at a time: log both arms' reps, weight is the one dumbbell.
  { key: 'singlearmdbrow', label: 'Single-Arm DB Row', unit: 'reps', weightNote: 'one dumbbell; log both arms\' reps' },
  { key: 'pecdeck', label: 'Pec Deck', unit: 'reps', weightNote: 'machine stack setting' },
  { key: 'ezbarcurl', label: 'EZ Bar Curl', unit: 'reps', weightNote: 'bar + plates' },
];

/** A lift cannot be scored without a weight; squats are the exception (none = bodyweight). */
export function weightIsRequired(ref: number | null, mode: WeightMode): boolean {
  return ref !== null && mode !== 'add';
}

/** Swims are stored in yards; meters are converted on entry. */
export const YARDS_PER_METER = 1.0936133;

/** Typo guard per entry, not a cap. */
export const MAX_SINGLE_ENTRY: Record<string, number> = { run: 50, swim: 10000 };

/** The same guard for a cardio unit with no entry above (an exercise approved later in that unit). */
export const MAX_SINGLE_ENTRY_BY_UNIT: Partial<Record<Unit, number>> = { flights: 200, jumps: 20000 };

/** Keys must be Discord-command-legal (/pushups). */
export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function formatAmount(amount: number, unit: Metric): string {
  // Points render bare like reps; counts are grouped (season totals reach five figures).
  if (unit === 'reps' || unit === 'pts') return Math.round(amount).toLocaleString('en-US');
  if (unit === 'min') return `${trimNumber(amount)}min`;
  if (unit === 'flights') return `${trimNumber(amount)} ${amount === 1 ? 'flight' : 'flights'}`;
  if (unit === 'jumps') return `${Math.round(amount).toLocaleString('en-US')} ${amount === 1 ? 'jump' : 'jumps'}`;
  return `${trimNumber(amount)}${unit}`;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function unitSuffix(unit: Metric): string {
  if (unit === 'pts') return 'points';
  return unit === 'reps' ? 'reps' : unit;
}

/** One decimal at most, grouped: 8.1, 194.4, 1,203. For a single reply, not a chart axis. */
export function formatPoints(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatWeight(lb: number): string {
  return `${trimNumber(lb)} lb`;
}

/** Whether two scores tie: totals are float sums, so compare within half a hundredth. */
export function samePoints(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/** Lowercase letters and digits only: "Push-ups", "push ups" and "pushups" are one name. */
export function squashName(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** squashName without a trailing plural "s", so "Pushup" finds "Push-ups". */
export function canonName(raw: string): string {
  return squashName(raw).replace(/s$/, '');
}
