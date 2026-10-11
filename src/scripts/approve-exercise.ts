// Prices a queued exercise or merges it into an existing one (docs/points-new-exercises.md). Usage: approve-args.ts.
import { config, requireGuildId } from '../config.js';
import { db } from '../db/index.js';
import { approveExercise, getExercise, mergeExercise, scoreboard, unfrozenClosedSeasons } from '../db/queries.js';
import { currentSeason } from '../seasons.js';
import { dayKeyFor } from '../time.js';
import { parseApproveArgs, type ApproveCommand } from './approve-args.js';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parse(): ApproveCommand {
  try {
    return parseApproveArgs(process.argv.slice(2));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

const cmd = parse();

const guildId = requireGuildId();
const conn = db();

// A price change while a closed season is not frozen yet would be baked into its trophy.
const unfrozen = unfrozenClosedSeasons(guildId);
if (unfrozen.length > 0) {
  fail(`${unfrozen.map((s) => s.label).join(', ')} has closed but is not frozen yet. The bot freezes it when it starts or at the next recap time (${config.recapTime}); price after that.`);
}

function seasonBoard(): Map<string, number> {
  const season = currentSeason();
  return new Map(scoreboard(guildId, season.startDay, dayKeyFor()).map((r) => [r.displayName, r.points]));
}

const entryCount = (conn.prepare('SELECT COUNT(*) AS n FROM entries WHERE exercise_key = ?').get(cmd.key) as { n: number }).n;
const before = seasonBoard();

// Everything the command changes happens here, so --dry-run can run all of it and roll it back.
class Rollback extends Error {}

function apply(): void {
  if (cmd.command === 'approve') {
    let ex;
    try {
      ex = approveExercise(cmd.key, {
        label: cmd.label,
        pricing: cmd.pricing,
        note: cmd.note,
        unit: cmd.unit,
        ...(cmd.newKey !== undefined ? { newKey: cmd.newKey } : {}),
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    if (!ex) fail(`"${cmd.key}" is not a pending exercise.`);
    const finalKey = ex.key;
    console.log(
      `Priced ${ex.label}${finalKey !== cmd.key ? ` (key ${cmd.key} -> ${finalKey})` : ''}: ${JSON.stringify(cmd.pricing)}` +
        `. ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} backfilled.`,
    );
    const noWeight = (
      conn.prepare('SELECT COUNT(*) AS n FROM entries WHERE exercise_key = ? AND weight IS NULL').get(finalKey) as { n: number }
    ).n;
    if (cmd.pricing.kind === 'lift' && noWeight > 0) {
      console.log(`Note: ${noWeight} of them have no weight, and a weighted lift with no weight scores 0.`);
    }
    if (cmd.pricing.kind === 'bw' && cmd.pricing.assist && noWeight > 0) {
      console.log(`Note: ${noWeight} of them have no assistance logged, and score 0.`);
    }
  } else {
    if (!getExercise(cmd.into)) fail(`"${cmd.into}" is not an active exercise.`);
    let moved;
    try {
      moved = mergeExercise(cmd.key, cmd.into);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    console.log(`Merged ${cmd.key} into ${cmd.into}: ${moved} entr${moved === 1 ? 'y' : 'ies'} moved.`);
    const noWeight = (
      conn.prepare('SELECT COUNT(*) AS n FROM entries WHERE exercise_key = ? AND weight IS NULL').get(cmd.into) as { n: number }
    ).n;
    if (getExercise(cmd.into)!.refWeight !== null && noWeight > 0) {
      console.log(`Note: ${cmd.into} now has ${noWeight} entr${noWeight === 1 ? 'y' : 'ies'} with no weight (a lift scores those 0).`);
    }
  }

  const after = seasonBoard();
  const changes = [...after].filter(([name, pts]) => Math.abs(pts - (before.get(name) ?? 0)) > 0.005);
  for (const [name, pts] of changes) {
    console.log(`  ${currentSeason().label}: ${name} ${Math.round(before.get(name) ?? 0)} -> ${Math.round(pts)}`);
  }
}

if (cmd.dryRun) {
  try {
    conn.transaction(() => {
      apply();
      throw new Rollback();
    })();
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  console.log('DRY RUN: nothing was changed. Run it again without --dry-run to apply.');
} else {
  apply();
  console.log('Restart the bot (sudo systemctl restart wtca-bot) so the new command is registered.');
}
