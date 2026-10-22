// Points for one entry: reps x price per rep at the logged weight. Pure and unrounded; method in docs/points.md.
import { BODYWEIGHT_TABLES, LIFT_TABLES, REPS_TABLES, tableAt, type Row } from './strengthLevelTables.js';
import { BODY_LB, type WeightMode } from './exercises.js';

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
  // docs/points-lifts.md: a one-side rep (one arm or one leg, logged per side) pays half a rep that works both sides.
  ONE_SIDE_FACTOR: 0.5,
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
  reversegriplatpulldown: [98, 136, 183, 236],
  // The latpulldown anchors x1.5: the handles carry about 0.63 of the stack setting (measured from the manual's cable layout and photos, 90% range 0.58-0.67), so a stack setting of 1.5w is priced as w on the plain lat pulldown.
  machinelatpulldown: [133.5, 186, 249, 322.5],
  row: [86, 123, 168, 220],
  bentoverrow: [84, 120, 165, 217],
  deadlift: [160, 220, 293, 377],
  rdl: [115, 168, 235, 313],
  dbrdl: [66, 110, 166, 236], // 33/55/83/118 per dumbbell, doubled
  barbellpreachercurl: [37, 59, 87, 120], // preacher curl table, with the bar
  bicepcurls: [39, 61, 89, 123], // barbell curl table
  hammercurls: [36, 60, 90, 126],
  facepulls: [27, 53, 90, 137],
  inclinecurls: [34, 52, 76, 102],
  triceppushdown: [38, 67, 107, 157],
  machinetricepextensions: [58, 96, 145, 204], // seated tricep extension machine (stack setting)
  chestpress: [70, 114, 172, 242], // machine chest press, converging or fixed path (Strength Level has one entry for both)
  lateralraise: [18, 36, 64, 98],
  seatedlegcurl: [72, 112, 163, 224],
  lyinglegcurl: [54, 86, 127, 177],
  cableflies: [12, 34, 67, 112],
  cablecrunch: [48, 85, 134, 196],
  inclinedumbbellpress: [76, 108, 148, 192],
  reardeltfly: [51, 84, 126, 178], // machine reverse fly (stack setting)
  barbellbulgariansplitsquat: [32, 69, 123, 194],
  dbbulgariansplitsquat: [44, 80, 126, 184], // 22/40/63/92 per dumbbell, doubled
  singlearmdbrow: [33, 54, 81, 113], // dumbbell row table: one arm, one dumbbell, not doubled
  pecdeck: [76, 117, 169, 231], // machine chest fly table (stack setting)
  ezbarcurl: [46, 65, 90, 118], // EZ bar curl table, with the bar
  hipabduction: [71, 122, 190, 273], // seated hip abduction machine (stack setting, both legs)
  seatedcalfraise: [54, 106, 179, 271], // plate-loaded seated calf machine, plates loaded
};

/** Catalog lifts done one leg or one arm at a time, each side's reps logged (docs/points-lifts.md). */
export const ONE_SIDE_LIFTS = new Set(['singlelegpress', 'barbellbulgariansplitsquat', 'dbbulgariansplitsquat', 'singlearmdbrow']);

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
  // One side at a time, each side's reps logged: every rep pays ONE_SIDE_FACTOR of the curve.
  oneSide?: boolean;
}

export type PricingSpec =
  | { kind: 'flat'; p: number; unit?: string; table?: string }
  | { kind: 'lift'; oneRM: number[]; table?: string; oneSide?: boolean }
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
  lunges: { ...bodyweight(DECISIONS.K_FULL, [14, 38], 'lunges', { reps: [1, 14, 38, 68] }), oneSide: true },
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
  if (lift) return { kind: 'lift', oneRM: [...lift], table: key, ...(ONE_SIDE_LIFTS.has(key) ? { oneSide: true } : {}) };
  const flat = FLAT[key];
  if (flat) return { kind: 'flat', p: flat.p, ...(flat.unit ? { unit: flat.unit } : {}), ...(flat.table ? { table: flat.table } : {}) };
  return null;
}

/** Price per rep at a logged weight (null = none logged), for one body weight. */
export type Curve = (weight: number | null) => number;

/** A table by name; own keys only, so "constructor" or "toString" are not tables. */
function tableNamed(tables: Record<string, Row[]>, name: string | undefined): Row[] | undefined {
  return name !== undefined && Object.hasOwn(tables, name) ? tables[name] : undefined;
}

// True when a body weight differs from the reference.
const offReference = (bodyLb: number): boolean => Math.abs(bodyLb - SCORING.BODY_LB) > 1e-9;

// A flat price p is the price at 150 lb. At another body weight it scales by the person's implied price (mean of
// 120 / Novice reps and 240 / Intermediate reps from their row) over the 150 lb implied price.
function flatFactor(table: string | undefined, bodyLb: number): number {
  if (table === undefined) return 1;
  const rows = tableNamed(REPS_TABLES, table);
  if (!rows) throw new Error(`pricing names a reps table "${table}" that does not exist`);
  if (!offReference(bodyLb)) return 1;
  const at = tableAt(rows, bodyLb);
  const ref = tableAt(rows, SCORING.BODY_LB);
  return impliedFlatPrice(at[1], at[2]) / impliedFlatPrice(ref[1], ref[2]);
}

// Each anchor moved by the table row at bodyLb over its row at 150 lb.
function anchorsAt(anchors: readonly number[], table: string | undefined, tables: Record<string, Row[]>, bodyLb: number): number[] {
  if (table === undefined) return [...anchors];
  const rows = tableNamed(tables, table);
  if (!rows) throw new Error(`pricing names a table "${table}" that does not exist`);
  if (!offReference(bodyLb)) return [...anchors];
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
  const b = spec.table !== undefined ? bodyLb : SCORING.BODY_LB;
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

/** What an exercise with no usable pricing record pays: nothing. Pending exercises are the intended case; any other is reported (see curveForRow). */
export const unpricedCurve: Curve = () => 0;

export function buildCurve(spec: PricingSpec, bodyLb: number = SCORING.BODY_LB): Curve {
  switch (spec.kind) {
    case 'flat':
      return flatCurve(spec.p * flatFactor(spec.table, bodyLb));
    case 'lift':
      if (spec.oneRM.length !== 4) throw new Error('a lift needs four 1RM anchors');
      return oneSided(liftCurve(spec.oneRM, spec.table, bodyLb), spec.oneSide);
    case 'bw':
      return oneSided(bodyweightCurve(spec, bodyLb), spec.oneSide);
  }
}

/** A one-side exercise pays ONE_SIDE_FACTOR of the curve per rep, so both sides together pay what one rep using both sides pays. */
function oneSided(curve: Curve, oneSide: boolean | undefined): Curve {
  return oneSide ? (w) => DECISIONS.ONE_SIDE_FACTOR * curve(w) : curve;
}

/** Points for an entry: reps x price per rep at the logged weight. Sets at one weight combine exactly. */
export function entryPoints(curve: Curve, reps: number, weight: number | null): number {
  return reps * curve(weight);
}

// Upper bounds that catch a typo (a price of 5000 or a k of 50), not a judgement; run pays 521 a mile.
const MAX_PRICE = 1000;
const MAX_K = 2;

/** Why a pricing record is unusable, or null when it is well formed. Structural: every stored record must pass this. */
export function pricingProblem(spec: unknown): string | null {
  if (typeof spec !== 'object' || spec === null) return 'a pricing record is an object';
  const s = spec as Record<string, unknown>;
  const price = (p: unknown): boolean => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= MAX_PRICE;
  // Anchors are Beginner / Novice / Intermediate / Advanced, so each is larger than the one before.
  const anchors = (a: unknown): boolean =>
    Array.isArray(a) &&
    a.length === 4 &&
    a.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0) &&
    a.every((x, i) => i === 0 || x > (a as number[])[i - 1]!);
  if (s.kind !== 'flat' && s.kind !== 'lift' && s.kind !== 'bw') return 'kind is flat, lift or bw';
  const tables = s.kind === 'lift' ? LIFT_TABLES : s.kind === 'bw' ? BODYWEIGHT_TABLES : REPS_TABLES;
  if (s.table !== undefined && (typeof s.table !== 'string' || !tableNamed(tables, s.table))) {
    return `"${String(s.table)}" is not a table in src/strengthLevelTables.ts for a ${s.kind} price`;
  }
  if (s.kind === 'flat') return price(s.p) ? null : `a flat price is a number from 0 to ${MAX_PRICE}`;
  if (s.oneSide !== undefined && typeof s.oneSide !== 'boolean') return 'oneSide is true or false';
  if (s.kind === 'lift') return anchors(s.oneRM) ? null : 'a lift needs four increasing positive 1RMs (Beginner, Novice, Intermediate, Advanced)';
  if (!price(s.p)) return `a bodyweight price is a number from 0 to ${MAX_PRICE}`;
  if (typeof s.k !== 'number' || !(s.k > 0 && s.k <= MAX_K)) return `k is the share of body weight counted as load: above 0 and at most ${MAX_K}`;
  if ((s.reps !== undefined) === (s.oneRM !== undefined)) return 'a bodyweight curve needs exactly one of reps or oneRM';
  if (!anchors(s.reps ?? s.oneRM)) return 'reps / oneRM are four increasing positive numbers (Beginner, Novice, Intermediate, Advanced)';
  if (s.assist !== undefined && typeof s.assist !== 'boolean') return 'assist is true or false';
  return null;
}

export function pricingValid(spec: unknown): spec is PricingSpec {
  return pricingProblem(spec) === null;
}

/**
 * Why a record may not be written for a newly priced exercise, or null. Beyond being well formed it must follow body weight:
 * every priced exercise names its by-bodyweight table so nobody is scored by a 150 lb row they do not belong to.
 * Only a flat 0 (tracked, no points) has nothing to scale. Every write of a pricing record goes through this.
 */
export function approvalProblem(spec: unknown): string | null {
  const problem = pricingProblem(spec);
  if (problem) return problem;
  const s = spec as PricingSpec;
  if (s.table === undefined && !(s.kind === 'flat' && s.p === 0)) {
    return 'a priced exercise needs its by-bodyweight table: add the rows to src/strengthLevelTables.ts, deploy, then price it with that table (only a flat 0 may go without)';
  }
  return null;
}

/** The code's own catalog must be well formed and follow body weight; a bad entry stops the bot at boot, not at scoring time. */
export function assertCatalog(): void {
  const keys = new Set([...Object.keys(BODYWEIGHT), ...Object.keys(LIFT_1RM), ...Object.keys(FLAT)]);
  for (const key of keys) {
    const spec = catalogPricing(key)!;
    // A distance price (per mile or yard) has no body-weight table.
    const problem = spec.kind === 'flat' && spec.unit ? pricingProblem(spec) : approvalProblem(spec);
    if (problem) throw new Error(`catalog pricing for "${key}": ${problem}`);
  }
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
  pending?: boolean;
}

const reported = new Set<string>();

/** The curve for a row at a body weight: its pricing record. No usable record pays 0, and says so once unless the exercise is pending. */
export function curveForRow(row: PricingRow, bodyLb: number = SCORING.BODY_LB): Curve {
  const spec = parsePricing(row.pricing);
  if (spec) return buildCurve(spec, bodyLb);
  const id = row.key ?? '?';
  if (!row.pending && !reported.has(id)) {
    reported.add(id);
    console.error(`scoring: exercise ${id} has ${row.pricing ? 'an unusable' : 'no'} pricing record and scores 0`);
  }
  return unpricedCurve;
}

/** The record stored for an approved exercise, plus the columns that tell the slash command what to ask for. */
export function pricingColumns(spec: PricingSpec): { json: string; ref: number | null; mode: WeightMode; display: number } {
  const json = JSON.stringify(spec);
  const side = spec.kind !== 'flat' && spec.oneSide ? DECISIONS.ONE_SIDE_FACTOR : 1;
  switch (spec.kind) {
    case 'flat':
      return { json, ref: null, mode: 'load', display: spec.p };
    case 'lift':
      return { json, ref: SCORING.EIGHT_REP_FRACTION * spec.oneRM[1]!, mode: 'load', display: side * ANCHOR_PRICES[1]! };
    case 'bw':
      return {
        json,
        ref: spec.assist ? SCORING.BODY_LB : spec.k * SCORING.BODY_LB,
        mode: spec.assist ? 'assist' : 'add',
        display: side * spec.p,
      };
  }
}
