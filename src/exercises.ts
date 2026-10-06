/** What an exercise counts; distances have their own units because 25yd and 25m laps differ. */
export type Unit = 'reps' | 'mi' | 'km' | 'yd' | 'm' | 'min';

export type Metric = Unit | 'pts';

/** Reference body weight in lb. */
export const BODY_LB = 150;

/** load: the logged weight; add: the logged load plus what a bodyweight rep moves; assist: body weight minus the assistance. */
export type WeightMode = 'load' | 'add' | 'assist';

export function effectiveWeight(mode: WeightMode, weight: number, ref: number): number {
  if (mode === 'add') return ref + weight;
  if (mode === 'assist') return Math.max(BODY_LB - weight, 0);
  return weight;
}

/** Fallback price per rep for a row with no pricing record: base x effective weight / reference weight. */
export function pointsPerRepAt(
  base: number,
  ref: number | null,
  mode: WeightMode,
  weight: number | null,
): number {
  if (ref === null || weight === null) return base;
  return (base * effectiveWeight(mode, weight, ref)) / ref;
}

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
  { key: 'row', label: 'Row', unit: 'reps', weightNote: 'total load' },
  { key: 'deadlift', label: 'Deadlift', unit: 'reps', weightNote: 'bar + plates' },
  { key: 'rdl', label: 'Romanian Deadlift', unit: 'reps', weightNote: 'total load' },
  { key: 'bicepcurls', label: 'Bicep Curls', unit: 'reps', weightNote: 'dumbbells combined, or the bar' },
  { key: 'triceppushdown', label: 'Tricep Pushdown', unit: 'reps', weightNote: 'stack setting' },
  { key: 'cableflies', label: 'Cable Flies', unit: 'reps', weightNote: 'both sides combined' },
  { key: 'lateralraise', label: 'Lateral Raise', unit: 'reps', weightNote: 'both dumbbells combined' },
  // One lift for every leg curl machine; priced from the seated table.
  { key: 'legcurl', label: 'Leg Curl', unit: 'reps', weightNote: 'machine stack setting' },
  { key: 'assistedpullups', label: 'Assisted Pull-ups', unit: 'reps', weightNote: 'assistance, not your weight' },
  { key: 'swim', label: 'Swim', unit: 'yd' },
  // Kneeling rope cable crunch only; ab machines need their own lift.
  { key: 'cablecrunch', label: 'Cable Crunch', unit: 'reps', weightNote: 'cable stack setting' },
];

/** A lift cannot be scored without a weight; squats are the exception (none = bodyweight). */
export function weightIsRequired(ref: number | null, mode: WeightMode): boolean {
  return ref !== null && mode !== 'add';
}

/** Swims are stored in yards; meters are converted on entry. */
export const YARDS_PER_METER = 1.0936133;

/** Typo guard per entry, not a cap. */
export const MAX_SINGLE_ENTRY: Record<string, number> = { run: 50, swim: 10000 };

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
