// Prices a queued exercise or merges it into an existing one (docs/points-new-exercises.md).
//   approve <key> --label "Name" (--flat <p> | --lift <b,n,i,a> | --bw <p> --k <share> (--reps <b,n,i,a> | --onerm <b,n,i,a>) [--assist]) [--table <key>] [--note "..."] [--as <new-key>]
//   merge <key> --into <existing-key>
import { config } from '../config.js';
import { db } from '../db/index.js';
import { approveExercise, getExercise, mergeExercise, scoreboard } from '../db/queries.js';
import { currentSeason } from '../seasons.js';
import { dayKeyFor } from '../time.js';
import { pricingValid, type PricingSpec } from '../scoring.js';

const [command, key, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function seasonBoard(): Map<string, number> {
  const season = currentSeason();
  return new Map(scoreboard(config.guildId, season.startDay, dayKeyFor()).map((r) => [r.displayName, r.points]));
}

if (!command || !key || (command !== 'approve' && command !== 'merge')) {
  fail(
    'usage: approve <key> --label "Name" (--flat <p> | --lift <b,n,i,a> | --bw <p> --k <share> (--reps <b,n,i,a> | --onerm <b,n,i,a>) [--assist]) [--table <key>] [--note "..."] [--as <new-key>]\n' +
      '       merge <key> --into <existing-key>',
  );
}

const conn = db();
const entryCount = (conn.prepare('SELECT COUNT(*) AS n FROM entries WHERE exercise_key = ?').get(key) as { n: number }).n;
const before = seasonBoard();

if (command === 'approve') {
  const label = flag('label') ?? fail('--label is required');
  const list = (name: string): number[] | undefined => flag(name)?.split(',').map(Number);
  let pricing: PricingSpec;
  if (flag('flat') !== undefined) {
    pricing = { kind: 'flat', p: Number(flag('flat')) };
  } else if (flag('lift') !== undefined) {
    pricing = { kind: 'lift', oneRM: list('lift')! };
  } else if (flag('bw') !== undefined) {
    const spec: PricingSpec = { kind: 'bw', p: Number(flag('bw')), k: Number(flag('k') ?? fail('--k is required with --bw')) };
    if (flag('reps') !== undefined) spec.reps = list('reps');
    if (flag('onerm') !== undefined) spec.oneRM = list('onerm');
    if (rest.includes('--assist')) spec.assist = true;
    pricing = spec;
  } else {
    fail('give one of --flat, --lift or --bw');
  }
  // --table <key> is the by-bodyweight table that moves this exercise with /weight; without it everyone scores the same.
  const table = flag('table');
  if (table !== undefined) pricing.table = table;
  if (!pricingValid(pricing)) fail('That pricing is not valid: a price is a number >= 0 and a curve needs four positive numbers.');

  // --as <new-key> renames the exercise (and so its slash command) as it is priced; without it the key stays as the player typed it.
  const newKey = flag('as');
  let ex;
  try {
    ex = approveExercise(key, { label, pricing, note: flag('note') ?? null, ...(newKey !== undefined ? { newKey } : {}) });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  if (!ex) fail(`"${key}" is not a pending exercise.`);
  const finalKey = ex.key;
  console.log(
    `Priced ${ex.label}${finalKey !== key ? ` (key ${key} -> ${finalKey})` : ''}: ${JSON.stringify(pricing)}` +
      `. ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} backfilled.`,
  );
  const noWeight = (
    conn.prepare('SELECT COUNT(*) AS n FROM entries WHERE exercise_key = ? AND weight IS NULL').get(finalKey) as { n: number }
  ).n;
  if (pricing.kind === 'lift' && noWeight > 0) {
    console.log(`Note: ${noWeight} of them have no weight, and a weighted lift with no weight scores 0.`);
  }
  if (pricing.kind === 'bw' && pricing.assist && noWeight > 0) {
    console.log(`Note: ${noWeight} of them have no assistance logged, and score 0.`);
  }
} else {
  const into = flag('into') ?? fail('--into <existing-key> is required');
  if (!getExercise(into)) fail(`"${into}" is not an active exercise.`);
  const moved = mergeExercise(key, into);
  if (moved === null) fail(`Cannot merge "${key}" into "${into}": it must be pending and the target must be a normal active exercise.`);
  console.log(`Merged ${key} into ${into}: ${moved} entr${moved === 1 ? 'y' : 'ies'} moved.`);
  const target = getExercise(into)!;
  if (target.refWeight) {
    const noWeight = (
      conn.prepare('SELECT COUNT(*) AS n FROM entries WHERE exercise_key = ? AND weight IS NULL').get(into) as { n: number }
    ).n;
    if (noWeight > 0) console.log(`Note: ${into} now has ${noWeight} entr${noWeight === 1 ? 'y' : 'ies'} with no weight (a lift scores those 0).`);
  }
}

const after = seasonBoard();
const changes = [...after].filter(([name, pts]) => Math.abs(pts - (before.get(name) ?? 0)) > 0.005);
for (const [name, pts] of changes) {
  console.log(`  ${currentSeason().label}: ${name} ${Math.round(before.get(name) ?? 0)} -> ${Math.round(pts)}`);
}
console.log('Restart the bot (sudo systemctl restart wtca-bot) so the new command is registered.');
