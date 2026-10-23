// Height and age in lift scoring (docs/points-height.md). A family lift's 1RM anchors are multiplied by exp(beta x (H - expected H at the
// person's mass)) and by the age factor; no height or no age is neutral (factor 1), and a lift with no family is never adjusted.
//
// Coefficients: Isenmann E, Geisler S, Havers T et al., Sci Rep 2026;16:20797, Table 2, men, reduced model (ln 1RM on height cm, age, age^2,
// ln m, ln m^2), read 2026-10-22 (https://pmc.ncbi.nlm.nih.gov/articles/PMC13338387/). Expected height: ANSUR II men (n 4,082, measured),
// ln(height cm) on ln(mass kg), fitted by src/scripts/fit-ansur.ts on 2026-10-23.

/** Which of Isenmann's lifts a lift takes its coefficients from (docs/points-height.md lists which lifts carry one, and why). */
export type HeightFamily = 'press' | 'squat' | 'hinge';

export const HEIGHT_FAMILIES: readonly HeightFamily[] = ['press', 'squat', 'hinge'];

// Per cm of height at fixed mass and age: bench press, back squat, deadlift.
export const HEIGHT_COEF: Record<HeightFamily, number> = { press: -0.0158, squat: -0.02408, hinge: -0.01987 };

// Age terms of the same models: [per year, per year^2].
export const AGE_COEF: Record<HeightFamily, readonly [number, number]> = {
  press: [0.00576, -0.00018],
  squat: [-0.00105, -0.00015],
  hinge: [0.00137, -0.00015],
};

// ln(expected height cm) = A + B x ln(mass kg), ANSUR II men.
export const EXPECTED_HEIGHT_FIT = { A: 4.6741, B: 0.1113 } as const;

// Strength Level publishes no user ages, so the mean age of Isenmann's sample stands in for the age built into its tables.
export const AGE_REFERENCE = 27.8;

// Accepted ranges: the ranges of Isenmann's sample, as /weight's 110-310 lb is the range of Strength Level's tables.
export const HEIGHT_MIN_CM = 150;
export const HEIGHT_MAX_CM = 206;
export const AGE_MIN = 16;
export const AGE_MAX = 64;

const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export function isHeightFamily(value: unknown): value is HeightFamily {
  return typeof value === 'string' && (HEIGHT_FAMILIES as readonly string[]).includes(value);
}

export const inHeightRange = (cm: number): boolean => Number.isFinite(cm) && cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM;
export const inAgeRange = (age: number): boolean => Number.isFinite(age) && age >= AGE_MIN && age <= AGE_MAX;

/** Mean height of men at this body weight (ANSUR II): the height a Strength Level row already assumes. */
export function expectedHeightCm(bodyLb: number): number {
  return Math.exp(EXPECTED_HEIGHT_FIT.A + EXPECTED_HEIGHT_FIT.B * Math.log(bodyLb * KG_PER_LB));
}

/** The person's height and age as entered; null is unset, which scores as the reference. */
export interface Anthro {
  heightCm: number | null;
  age: number | null;
}

export const NO_ANTHRO: Anthro = { heightCm: null, age: null };

/** Multiplier on a family lift's 1RM anchors for this person: 1 with no family, and for each of height and age that is unset. */
export function anthroFactor(family: HeightFamily | undefined, bodyLb: number, anthro: Anthro): number {
  if (family === undefined) return 1;
  let ln = 0;
  if (anthro.heightCm !== null) ln += HEIGHT_COEF[family] * (anthro.heightCm - expectedHeightCm(bodyLb));
  if (anthro.age !== null) {
    const [g1, g2] = AGE_COEF[family];
    const g = (a: number): number => g1 * a + g2 * a * a;
    ln += g(anthro.age) - g(AGE_REFERENCE);
  }
  return Math.exp(ln);
}
