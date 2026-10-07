// Points for one entry: reps x price per rep at the logged weight. Pure and unrounded; method in docs/points.md.
import { BODYWEIGHT_TABLES, LIFT_TABLES, REPS_TABLES, tableAt, type Row } from './strengthLevelTables.js';
import { BODY_LB, pointsPerRepAt, type WeightMode } from './exercises.js';

/** Strength Level's share of 1RM that `r` reps to failure represent: Brzycki below 8, Epley above 10, blended between. */
export function repsToFraction(r: number): number {
  const brzycki = (37 - r) / 36;
  const epley = 1 / (1 + r / 30);
  if (r < 8) return brzycki;
  if (r > 10) return epley;
  const t = (r - 8) / 2;
  return (1 - t) * brzycki + t * epley;
}

export const SCORING = {
  // Points an all-out set pays at Beginner / Novice / Intermediate / Advanced.
  LADDER: [30, 120, 240, 384] as const,
  // Set length the lift prices are calibrated to.
  SET_REPS: 8,
  // 8-rep weight as a share of 1RM (29/36).
  EIGHT_REP_FRACTION: repsToFraction(8),
  BODY_LB,
};

// Chosen values; each is argued on the docs page named beside it.
export const DECISIONS = {
  // docs/points-cardio.md: points for an all-out set (midpoint of Novice and Intermediate).
  SET_POINTS: 180,
  // docs/points-cardio.md: minutes per set including rest.
  MINUTES_PER_SET: 3.5,
  // docs/points-cardio.md: reference run pace, 10:08 per mile.
  RUN_MINUTES_PER_MILE: 10 + 8 / 60,
  // docs/points-cardio.md: reference swim pace, 2:00 per 100 yd.
  SWIM_MINUTES_PER_100_YD: 2.0,
  // docs/points-bodyweight-exercises.md: the assisted ab-roll pays 1 - 0.36 of the ab-roll.
  ASSISTED_AB_ROLL_FACTOR: 1 - 0.36,
  // docs/points-bodyweight-exercises.md: calf raise price per rep (an estimate).
  CALF_RAISE_FLAT: 1.4,
  // docs/points-lifts.md: share of body weight counted as load.
  K_PUSHUP: 0.7,
  K_SITUP: 0.678,
  K_FULL: 1.0,
};

/** Price per rep at each level's 8-rep weight: ladder / set length = 3.75, 15, 30, 48. */
export const ANCHOR_PRICES: number[] = SCORING.LADDER.map((points) => points / SCORING.SET_REPS);

/** docs/points-cardio.md: points per minute of lifting, 180 / 3.5. */
export const LIFTING_RATE = DECISIONS.SET_POINTS / DECISIONS.MINUTES_PER_SET;

/** Flat price of a bodyweight rep: the mean of ladder / reps at Novice and at Intermediate. */
export function impliedFlatPrice(noviceReps: number, intermediateReps: number): number {
  return (SCORING.LADDER[1] / noviceReps + SCORING.LADDER[2] / intermediateReps) / 2;
}

/** Strength Level men's 1RM at 150 lb, Beginner / Novice / Intermediate / Advanced (dumbbell lifts combined). */
export const LIFT_1RM: Record<string, [number, number, number, number]> = {
  benchpress: [99, 137, 183, 236],
  narrowbench: [95, 129, 170, 217],
  dbbench: [68, 104, 150, 206],
  overheadpress: [57, 83, 116, 154],
  legpress: [139, 226, 340, 478], // horizontal leg press table
  singlelegpress: [74, 144, 244, 369],
  latpulldown: [89, 124, 166, 215],
  // The latpulldown anchors doubled: this machine's stack setting is about twice the handle load, so a stack setting of 2w is priced as w on the plain lat pulldown.
  machinelatpulldown: [178, 248, 332, 430],
  row: [86, 123, 168, 220],
  bentoverrow: [84, 120, 165, 217],
  deadlift: [160, 220, 293, 377],
  rdl: [115, 168, 235, 313],
  bicepcurls: [39, 61, 89, 123], // barbell curl table
  hammercurls: [36, 60, 90, 126],
  facepulls: [27, 53, 90, 137],
  inclinecurls: [34, 52, 76, 102],
  triceppushdown: [38, 67, 107, 157],
  lateralraise: [18, 36, 64, 98],
  seatedlegcurl: [72, 112, 163, 224],
  lyinglegcurl: [54, 86, 127, 177],
  cableflies: [12, 34, 67, 112],
  cablecrunch: [48, 85, 134, 196],
  inclinedumbbellpress: [76, 108, 148, 192],
  reardeltfly: [51, 84, 126, 178], // machine reverse fly (stack setting)
  barbellbulgariansplitsquat: [32, 69, 123, 194],
  dbbulgariansplitsquat: [44, 80, 126, 184], // 22/40/63/92 per dumbbell, doubled
};

export interface BodyweightSpec {
  kind: 'bw';
  // Price of a rep with no added load at 150 lb.
  p: number;
  // Share of body weight counted as load; the offset is k x body weight.
  k: number;
  // Reps to failure at Beginner / Novice / Intermediate / Advanced (150 lb).
  reps?: number[];
  // Effective 1RMs at 150 lb (overrides reps); the pull-up uses the added-weight table.
  oneRM?: number[];
  // Assisted: the logged weight is assistance, subtracted from body weight.
  assist?: boolean;
  // Key into strengthLevelTables.ts; moves the anchors and the flat price with body weight.
  table?: string;
}

export type PricingSpec =
  | { kind: 'flat'; p: number; unit?: string; table?: string }
  | { kind: 'lift'; oneRM: number[]; table?: string }
  | BodyweightSpec;

// Pull-ups are anchored on effective 1RMs (body weight + added weight): the reps table shows "<1" at Beginner.
const PULLUP_EFFECTIVE_1RM = [144, 178, 216, 259];
// Novice / Intermediate reps that give the pull-up's flat price.
const PULLUP_FLAT_REPS: [number, number] = [7, 14];

function bodyweight(
  k: number,
  flatReps: [number, number],
  table: string,
  extra: { reps?: number[]; oneRM?: number[]; assist?: boolean; p?: number },
): BodyweightSpec {
  return { kind: 'bw', k, p: extra.p ?? impliedFlatPrice(flatReps[0], flatReps[1]), table, ...extra };
}

export const BODYWEIGHT: Record<string, BodyweightSpec> = {
  pushups: bodyweight(DECISIONS.K_PUSHUP, [20, 40], 'pushups', { reps: [5, 20, 40, 64] }),
  pullups: bodyweight(DECISIONS.K_FULL, PULLUP_FLAT_REPS, 'pullups', { oneRM: PULLUP_EFFECTIVE_1RM }),
  assistedpullups: bodyweight(DECISIONS.K_FULL, PULLUP_FLAT_REPS, 'pullups', { oneRM: PULLUP_EFFECTIVE_1RM, assist: true }),
  chinups: bodyweight(DECISIONS.K_FULL, [8, 14], 'chinups', { reps: [1, 8, 14, 22] }),
  dips: bodyweight(DECISIONS.K_FULL, [10, 20], 'dips', { reps: [2, 10, 20, 32] }),
  situps: bodyweight(DECISIONS.K_SITUP, [27, 57], 'situps', { reps: [5, 27, 57, 94] }),
  squats: bodyweight(DECISIONS.K_FULL, [26, 58], 'squats', { reps: [3, 26, 58, 98] }),
  // Strength Level's Beginner is "<1" lunge reps; 1 is used (an assumption, it only shapes the curve below Beginner).
  lunges: bodyweight(DECISIONS.K_FULL, [14, 38], 'lunges', { reps: [1, 14, 38, 68] }),
  calfraises: bodyweight(DECISIONS.K_FULL, [30, 63], 'calfraises', { reps: [7, 30, 63, 102], p: DECISIONS.CALF_RAISE_FLAT }),
};

const AB_ROLL_PRICE = impliedFlatPrice(7, 21);

/** Flat price per rep (per mile for run, per yard for swim). */
export const FLAT: Record<string, { p: number; unit?: string; table?: string }> = {
  legraise: { p: impliedFlatPrice(12, 31), table: 'legraise' },
  abrolls: { p: AB_ROLL_PRICE, table: 'abrolls' },
  abrollsassisted: { p: AB_ROLL_PRICE * DECISIONS.ASSISTED_AB_ROLL_FACTOR, table: 'abrolls' },
  burpees: { p: impliedFlatPrice(10, 35), table: 'burpees' },
  flightofstairs: { p: 0 },
  anklealphabet: { p: 0 },
  run: { p: LIFTING_RATE * DECISIONS.RUN_MINUTES_PER_MILE, unit: 'mi' },
  swim: { p: (LIFTING_RATE * DECISIONS.SWIM_MINUTES_PER_100_YD) / 100, unit: 'yd' },
};

/** The final pricing for a catalog exercise, or null for one the model does not cover. */
export function catalogPricing(key: string): PricingSpec | null {
  const bw = BODYWEIGHT[key];
  if (bw) return { ...bw };
  const lift = LIFT_1RM[key];
  if (lift) return { kind: 'lift', oneRM: [...lift], table: key };
  const flat = FLAT[key];
  if (flat) return { kind: 'flat', p: flat.p, ...(flat.unit ? { unit: flat.unit } : {}), ...(flat.table ? { table: flat.table } : {}) };
  return null;
}

/** Price per rep at a logged weight (null = none logged), for one body weight. */
export type Curve = (weight: number | null) => number;

// True when a body weight differs from the reference.
const offReference = (bodyLb: number): boolean => Math.abs(bodyLb - SCORING.BODY_LB) > 1e-9;

// A flat price p is the price at 150 lb. At another body weight it scales by the person's implied price (mean of
// 120 / Novice reps and 240 / Intermediate reps from their row) over the 150 lb implied price.
function flatFactor(table: string | undefined, bodyLb: number): number {
  const rows = table ? REPS_TABLES[table] : undefined;
  if (!rows || !offReference(bodyLb)) return 1;
  const at = tableAt(rows, bodyLb);
  const ref = tableAt(rows, SCORING.BODY_LB);
  return impliedFlatPrice(at[1], at[2]) / impliedFlatPrice(ref[1], ref[2]);
}

// Each anchor moved by the table row at bodyLb over its row at 150 lb.
function anchorsAt(anchors: readonly number[], table: string | undefined, tables: Record<string, Row[]>, bodyLb: number): number[] {
  const rows = table ? tables[table] : undefined;
  if (!rows || !offReference(bodyLb)) return [...anchors];
  const at = tableAt(rows, bodyLb);
  const ref = tableAt(rows, SCORING.BODY_LB);
  return anchors.map((x, i) => (x * at[i]!) / ref[i]!);
}

/** Lift price per rep: log-log between anchors, exponents extended outside them; weight <= 0 pays 0. */
export function liftPrice(oneRM: readonly number[]): (w: number) => number {
  const W = oneRM.map((x) => SCORING.EIGHT_REP_FRACTION * x);
  const P = ANCHOR_PRICES;
  const exp = [0, 1, 2].map((i) => Math.log(P[i + 1]! / P[i]!) / Math.log(W[i + 1]! / W[i]!));
  return (w) => {
    if (!(w > 0)) return 0;
    for (let i = 0; i < 3; i++) if (w <= W[i + 1]!) return P[i]! * Math.pow(w / W[i]!, exp[i]!);
    return P[3]! * Math.pow(w / W[3]!, exp[2]!);
  };
}

export function flatCurve(p: number): Curve {
  return () => p;
}

/** A lift curve: no weight scores 0; anchors follow body weight when the lift has a table. */
export function liftCurve(oneRM: readonly number[], table?: string, bodyLb: number = SCORING.BODY_LB): Curve {
  const price = liftPrice(anchorsAt(oneRM, table, LIFT_TABLES, bodyLb));
  return (w) => (w === null ? 0 : price(w));
}

/** Bodyweight curve: load = k x body weight + added load, scaled so a no-load rep pays p; assisted subtracts the assistance (none logged = 0). */
export function bodyweightCurve(spec: BodyweightSpec, bodyLb: number = SCORING.BODY_LB): Curve {
  const b = spec.table && BODYWEIGHT_TABLES[spec.table] ? bodyLb : SCORING.BODY_LB;
  const offset = spec.k * b;
  let oneRM: number[];
  if (spec.oneRM) {
    oneRM = anchorsAt(spec.oneRM, spec.table, BODYWEIGHT_TABLES, b);
  } else {
    const reps = anchorsAt(spec.reps ?? [], spec.table, BODYWEIGHT_TABLES, b);
    oneRM = reps.map((r) => offset / repsToFraction(r));
  }
  if (oneRM.length !== 4) throw new Error('a bodyweight curve needs four anchors (reps or oneRM)');
  const price = liftPrice(oneRM);
  const scale = (spec.p * flatFactor(spec.table, bodyLb)) / price(offset);
  if (spec.assist) return (w) => (w === null ? 0 : scale * price(Math.max(b - w, 0)));
  return (w) => scale * price(offset + Math.max(w ?? 0, 0));
}

/** Fallback for a row with no pricing record: base x effective weight / reference weight. */
export function legacyCurve(base: number, ref: number | null, mode: WeightMode): Curve {
  return (w) => pointsPerRepAt(base, ref, mode, w);
}

export function buildCurve(spec: PricingSpec, bodyLb: number = SCORING.BODY_LB): Curve {
  switch (spec.kind) {
    case 'flat':
      return flatCurve(spec.p * flatFactor(spec.table, bodyLb));
    case 'lift':
      if (spec.oneRM.length !== 4) throw new Error('a lift needs four 1RM anchors');
      return liftCurve(spec.oneRM, spec.table, bodyLb);
    case 'bw':
      return bodyweightCurve(spec, bodyLb);
  }
}

/** Points for an entry: reps x price per rep at the logged weight. Sets at one weight combine exactly. */
export function entryPoints(curve: Curve, reps: number, weight: number | null): number {
  return reps * curve(weight);
}

export function pricingValid(spec: unknown): spec is PricingSpec {
  if (typeof spec !== 'object' || spec === null) return false;
  const s = spec as Record<string, unknown>;
  const nums = (a: unknown, n: number): boolean =>
    Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);
  const price = (p: unknown): boolean => typeof p === 'number' && Number.isFinite(p) && p >= 0;
  const table = s.table === undefined || typeof s.table === 'string';
  if (s.kind === 'flat') return price(s.p) && table;
  if (s.kind === 'lift') return nums(s.oneRM, 4) && table;
  if (s.kind === 'bw') {
    return price(s.p) && typeof s.k === 'number' && s.k > 0 && (nums(s.oneRM, 4) || nums(s.reps, 4)) && table;
  }
  return false;
}

/** Parses a stored record; null for empty or unusable text (the caller falls back and warns). */
export function parsePricing(text: string | null): PricingSpec | null {
  if (!text) return null;
  try {
    const spec: unknown = JSON.parse(text);
    return pricingValid(spec) ? spec : null;
  } catch {
    return null;
  }
}

export interface PricingRow {
  key?: string;
  pricing: string | null;
  points_per_rep: number;
  ref_weight: number | null;
  weight_mode: WeightMode;
}

/** The curve for a row at a body weight: its pricing record, else the price x weight fallback. */
export function curveForRow(row: PricingRow, bodyLb: number = SCORING.BODY_LB): Curve {
  if (row.pricing) {
    const spec = parsePricing(row.pricing);
    if (spec) return buildCurve(spec, bodyLb);
    console.error(`scoring: exercise ${row.key ?? '?'} has an unusable pricing record; scoring it from its price and reference weight columns`);
  }
  return legacyCurve(row.points_per_rep, row.ref_weight, row.weight_mode);
}

/** The price per rep at a weight for a row, e.g. for a reply. Same code as the SQL function. */
export function pricePerRep(row: PricingRow, weight: number | null, bodyLb: number = SCORING.BODY_LB): number {
  return curveForRow(row, bodyLb)(weight);
}

/** The record stored for an approved exercise, plus the columns that tell the slash command what to ask for. */
export function pricingColumns(spec: PricingSpec): { json: string; ref: number | null; mode: WeightMode; display: number } {
  const json = JSON.stringify(spec);
  switch (spec.kind) {
    case 'flat':
      return { json, ref: null, mode: 'load', display: spec.p };
    case 'lift':
      return { json, ref: SCORING.EIGHT_REP_FRACTION * spec.oneRM[1]!, mode: 'load', display: ANCHOR_PRICES[1]! };
    case 'bw':
      return {
        json,
        ref: spec.assist ? SCORING.BODY_LB : spec.k * SCORING.BODY_LB,
        mode: spec.assist ? 'assist' : 'add',
        display: spec.p,
      };
  }
}
