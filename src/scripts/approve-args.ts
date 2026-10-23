// Command line of approve-exercise, parsed strictly: an unknown flag, a missing value, a flag that takes no value given one, two
// kinds of price at once, or a list that is not four numbers is an error and never a guess. Pure, so check-guards.ts can test it.
import { parseArgs } from 'node:util';
import { APPROVE_UNITS, type Unit } from '../exercises.js';
import { isHeightFamily, HEIGHT_FAMILIES } from '../anthropometry.js';
import { LIFT_HEIGHT_FAMILY, type BodyweightSpec, type PricingSpec } from '../scoring.js';

export const APPROVE_USAGE =
  'usage: approve <key> --label "Name" (--flat <p> [--unit mi|yd|flights|jumps] | --lift <b,n,i,a> | --bw <p> --k <share> (--reps <b,n,i,a> | --onerm <b,n,i,a>) [--assist])\n' +
  '                    --table <key> [--one-side] [--height press|squat|hinge] [--note "..."] [--as <new-key>] [--dry-run]\n' +
  '--one-side (lift or bw): done one arm or leg at a time with each side\'s reps logged; every rep pays half.\n' +
  '--height (lift only): the lift whose height and age coefficients apply (docs/points-height.md); a lift on a table that has one takes it without the flag.\n' +
  '       merge <key> --into <existing-key> [--dry-run]\n' +
  '--table is the exercise\'s by-bodyweight table in src/strengthLevelTables.ts and is required (only --flat 0, or a cardio price with --unit, may go without).\n' +
  '--dry-run runs it, shows how every total moves, and rolls it back.';

export type ApproveCommand =
  | {
      command: 'approve';
      key: string;
      label: string;
      pricing: PricingSpec;
      note: string | null;
      newKey: string | undefined;
      unit: Unit;
      dryRun: boolean;
    }
  | { command: 'merge'; key: string; into: string; dryRun: boolean };

const OPTIONS = {
  label: { type: 'string' },
  flat: { type: 'string' },
  lift: { type: 'string' },
  bw: { type: 'string' },
  k: { type: 'string' },
  reps: { type: 'string' },
  onerm: { type: 'string' },
  assist: { type: 'boolean' },
  'one-side': { type: 'boolean' },
  height: { type: 'string' },
  unit: { type: 'string' },
  table: { type: 'string' },
  note: { type: 'string' },
  as: { type: 'string' },
  into: { type: 'string' },
  'dry-run': { type: 'boolean' },
} as const;

function number(name: string, raw: string): number {
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`--${name} must be a plain non-negative number, not "${raw}"`);
  return Number(raw);
}

function list4(name: string, raw: string): number[] {
  const parts = raw.split(',');
  if (parts.length !== 4) throw new Error(`--${name} takes four comma-separated numbers (Beginner,Novice,Intermediate,Advanced), not "${raw}"`);
  return parts.map((p) => number(name, p));
}

export function parseApproveArgs(argv: string[]): ApproveCommand {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message.split('\n')[0] : String(err)}\n${APPROVE_USAGE}`);
  }
  const { values, positionals } = parsed;
  const [command, key, ...extra] = positionals;
  if ((command !== 'approve' && command !== 'merge') || !key || extra.length > 0) throw new Error(APPROVE_USAGE);
  const given = Object.keys(values);
  const only = (allowed: string[]): void => {
    const stray = given.filter((g) => !allowed.includes(g));
    if (stray.length > 0) throw new Error(`${stray.map((s) => `--${s}`).join(', ')} does not go with ${command}`);
  };
  const dryRun = values['dry-run'] === true;

  if (command === 'merge') {
    only(['into', 'dry-run']);
    if (values.into === undefined || values.into === '') throw new Error('--into <existing-key> is required');
    return { command, key, into: values.into, dryRun };
  }

  only(['label', 'flat', 'lift', 'bw', 'k', 'reps', 'onerm', 'assist', 'one-side', 'height', 'unit', 'table', 'note', 'as', 'dry-run']);
  if (!values.label?.trim()) throw new Error('--label "Name" is required');
  const kinds = (['flat', 'lift', 'bw'] as const).filter((n) => values[n] !== undefined);
  if (kinds.length !== 1) throw new Error('give exactly one of --flat, --lift or --bw');

  let pricing: PricingSpec;
  if (kinds[0] === 'flat') {
    only(['label', 'flat', 'unit', 'table', 'note', 'as', 'dry-run']);
    pricing = { kind: 'flat', p: number('flat', values.flat!) };
  } else if (kinds[0] === 'lift') {
    only(['label', 'lift', 'one-side', 'height', 'table', 'note', 'as', 'dry-run']);
    pricing = { kind: 'lift', oneRM: list4('lift', values.lift!) };
    if (values['one-side']) pricing.oneSide = true;
    if (values.height !== undefined) {
      if (!isHeightFamily(values.height)) throw new Error(`--height is ${HEIGHT_FAMILIES.join(', ')}, not "${values.height}"`);
      pricing.height = values.height;
    }
  } else {
    only(['label', 'bw', 'k', 'reps', 'onerm', 'assist', 'one-side', 'table', 'note', 'as', 'dry-run']);
    if (values.k === undefined) throw new Error('--k <share> is required with --bw');
    if ((values.reps === undefined) === (values.onerm === undefined)) throw new Error('--bw needs exactly one of --reps or --onerm');
    const spec: BodyweightSpec = { kind: 'bw', p: number('bw', values.bw!), k: number('k', values.k) };
    if (values.reps !== undefined) spec.reps = list4('reps', values.reps);
    if (values.onerm !== undefined) spec.oneRM = list4('onerm', values.onerm);
    if (values.assist) spec.assist = true;
    if (values['one-side']) spec.oneSide = true;
    pricing = spec;
  }
  if (values.table !== undefined) {
    if (values.table === '') throw new Error('--table needs a table key');
    pricing.table = values.table;
    // A lift on a table with a height family takes it, as migration 16 gave every such lift already priced.
    if (pricing.kind === 'lift' && pricing.height === undefined && Object.hasOwn(LIFT_HEIGHT_FAMILY, values.table)) {
      pricing.height = LIFT_HEIGHT_FAMILY[values.table];
    }
  }
  const unit = values.unit ?? 'reps';
  if (!APPROVE_UNITS.includes(unit as Unit) || unit === 'reps' && values.unit !== undefined) {
    throw new Error(`--unit is ${APPROVE_UNITS.filter((u) => u !== 'reps').join(', ')}, not "${unit}"`);
  }
  return {
    command,
    key,
    label: values.label.trim(),
    pricing,
    note: values.note?.trim() || null,
    newKey: values.as,
    unit: unit as Unit,
    dryRun,
  };
}
