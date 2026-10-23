// The guardrails around pricing and the data, on a throwaway db: what must be refused is refused, by every writer and not only the CLI.
// `tsx src/scripts/check-guards.ts`
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'out');
mkdirSync(outDir, { recursive: true });
const dbFile = join(outDir, 'guards.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(f, { force: true });
process.env.DB_PATH = dbFile;
process.env.DISCORD_GUILD_ID = 'g1';
const GUILD = 'g1';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : detail ? ` — ${detail}` : ''}`);
}
const throws = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};

const S = await import('../scoring.js');
const q = await import('../db/queries.js');
const { db, invalidateScoring } = await import('../db/index.js');
const { parseApproveArgs } = await import('./approve-args.js');
const { buildCommands } = await import('../commands/index.js');
const { plainText, formatAmount } = await import('../exercises.js');
const S_format = (n: number): string => formatAmount(n, 'flights');
const conn = db();

// --- the record itself ---
const lift = (oneRM: number[], table?: string): unknown => ({ kind: 'lift', oneRM, ...(table ? { table } : {}) });
check('a catalog price is a valid, table-following record', S.pricingValid(S.catalogPricing('benchpress')) && S.approvalProblem(S.catalogPricing('benchpress')) === null);
check('assertCatalog accepts the code\'s own catalog', throws(() => S.assertCatalog()) === null);
check('anchors that do not increase are refused (100,100,150,200 would divide by ln 1)', S.pricingProblem(lift([100, 100, 150, 200], 'benchpress')) !== null);
check('anchors that decrease are refused', S.pricingProblem(lift([200, 150, 100, 50], 'benchpress')) !== null);
check('an unknown table is refused', S.pricingProblem(lift([1, 2, 3, 4], 'nosuchtable')) !== null);
check('"constructor" is not a table', S.pricingProblem(lift([1, 2, 3, 4], 'constructor')) !== null && S.pricingProblem({ kind: 'flat', p: 1, table: 'toString' }) !== null);
check('a lift table is not accepted for a flat price (wrong kind of table)', S.pricingProblem({ kind: 'flat', p: 1, table: 'benchpress' }) !== null);
check('a price of 5000 and a k of 50 are refused as typos', S.pricingProblem({ kind: 'flat', p: 5000 }) !== null && S.pricingProblem({ kind: 'bw', p: 6, k: 50, reps: [1, 2, 3, 4] }) !== null);
check('NaN, Infinity and negative prices are refused', [NaN, Infinity, -1].every((p) => S.pricingProblem({ kind: 'flat', p }) !== null));
check('a bodyweight curve needs exactly one of reps or oneRM', S.pricingProblem({ kind: 'bw', p: 6, k: 1 }) !== null && S.pricingProblem({ kind: 'bw', p: 6, k: 1, reps: [1, 2, 3, 4], oneRM: [1, 2, 3, 4] }) !== null);
check('no table is not approvable, except a flat 0', S.approvalProblem(lift([86, 123, 168, 220])) !== null && S.approvalProblem({ kind: 'flat', p: 3 }) !== null && S.approvalProblem({ kind: 'flat', p: 0 }) === null);
check('scoring a record that names a missing table throws instead of skipping the scaling', throws(() => S.buildCurve({ kind: 'lift', oneRM: [1, 2, 3, 4], table: 'nosuchtable' }, 200)) !== null);

// --- the one write path ---
q.createPendingExercise('zzlift', 'Zz lift');
const rowAnchors = [86, 123, 168, 220];
check('approveExercise refuses a lift with no table', throws(() => q.approveExercise('zzlift', { label: 'Zz', pricing: { kind: 'lift', oneRM: rowAnchors } })) !== null && q.getExercise('zzlift')?.pending === true);
check('approveExercise refuses a typo table', throws(() => q.approveExercise('zzlift', { label: 'Zz', pricing: { kind: 'lift', oneRM: rowAnchors, table: 'rwo' } })) !== null);
check('approveExercise refuses a flat price with no table', throws(() => q.approveExercise('zzlift', { label: 'Zz', pricing: { kind: 'flat', p: 3 } })) !== null);
check('approveExercise refuses an empty label', throws(() => q.approveExercise('zzlift', { label: '  ', pricing: { kind: 'lift', oneRM: rowAnchors, table: 'row' } })) !== null);
check('approveExercise refuses a key that is a bot command', throws(() => q.approveExercise('zzlift', { label: 'Zz', pricing: { kind: 'lift', oneRM: rowAnchors, table: 'row' }, newKey: 'today' })) !== null && q.getExercise('zzlift')?.pending === true);
check('a distance may be priced per mile with no table, but only flat', throws(() => q.approveExercise('zzlift', { label: 'Zz', pricing: { kind: 'lift', oneRM: rowAnchors, table: 'row' }, unit: 'mi' })) !== null);
check('a bad unit is refused', throws(() => q.approveExercise('zzlift', { label: 'Zz', pricing: { kind: 'flat', p: 5 }, unit: 'min' })) !== null);
q.ensureUser('u1', 'Alex');
q.createPendingExercise('zzstairs', 'Zz stairs');
q.addEntry(GUILD, 'u1', 'zzstairs', '2026-10-05', 4);
const flights = q.approveExercise('zzstairs', { label: 'Zz stairs', pricing: { kind: 'flat', p: 9 }, unit: 'flights' });
check('a cardio price per flight is approvable with no table and the exercise counts flights', flights?.unit === 'flights' && q.priceAt(flights, null) === 9);
check('flights are not reps: they stay out of the reps total', !q.listExercises().filter((e) => e.unit === 'reps').some((e) => e.key === 'zzstairs'));
check('flights read as flights', S_format(1) === '1 flight' && S_format(4) === '4 flights');
check('jumps read as jumps', formatAmount(1, 'jumps') === '1 jump' && formatAmount(1500, 'jumps') === '1,500 jumps');
q.createPendingExercise('zzswim', 'Zz swim');
const dist = q.approveExercise('zzswim', { label: 'Zz swim', pricing: { kind: 'flat', p: 1.2 }, unit: 'yd' });
check('a flat price per yard is approvable and the exercise counts yards', dist?.unit === 'yd' && q.priceAt(dist, null) === 1.2);
check('an exercise priced with its table is approved', q.approveExercise('zzlift', { label: 'Zz', pricing: { kind: 'lift', oneRM: rowAnchors, table: 'row' } })?.pending === false);

// --- merge ---
q.createPendingExercise('zzmile', 'Zz mile');
check('merge refuses entries counted in another unit (reps into miles)', (throws(() => q.mergeExercise('zzmile', 'run')) ?? '').includes('cannot be added'));
q.ensureUser('u1', 'Alex');
q.createPendingExercise('zzweighted', 'Zz weighted');
q.addEntry(GUILD, 'u1', 'zzweighted', '2026-10-05', 10, 100);
check('merge refuses weighted entries into an exercise that takes no weight', (throws(() => q.mergeExercise('zzweighted', 'abrolls')) ?? '').includes('weights would be lost'));
check('and nothing moved', q.getExercise('zzweighted')?.pending === true);

// --- commands ---
conn.prepare("INSERT INTO exercises (key, label, unit, sort_order, active, points_per_rep, pricing) VALUES ('queue', 'Queue', 'reps', 998, 1, 0, '{\"kind\":\"flat\",\"p\":0}')").run();
invalidateScoring();
check('an exercise named like a built-in command stops the command tree being built', throws(() => buildCommands()) !== null);
conn.prepare("DELETE FROM exercises WHERE key = 'queue'").run();
invalidateScoring();

// --- the database refuses what the code would not write ---
check('exercises: a bad unit is refused by the database', throws(() => conn.prepare("INSERT INTO exercises (key, label, unit, sort_order) VALUES ('zzu', 'Zz', 'furlongs', 997)").run()) !== null);
check('exercises: a pricing record that is not JSON is refused', throws(() => conn.prepare("UPDATE exercises SET pricing = '{nope' WHERE key = 'run'").run()) !== null);
check('exercises: a bad weight_mode is refused', throws(() => conn.prepare("UPDATE exercises SET weight_mode = 'sideways' WHERE key = 'run'").run()) !== null);
check('entries: an amount of 0 or a negative weight is refused', throws(() => q.addEntry(GUILD, 'u1', 'run', '2026-10-05', 0)) !== null && throws(() => q.addEntry(GUILD, 'u1', 'benchpress', '2026-10-05', 5, -10)) !== null);
q.setUserWeight('u1', 180);
check('the weight log is append-only', throws(() => conn.prepare('DELETE FROM user_weight_log').run()) !== null && throws(() => conn.prepare('UPDATE user_weight_log SET weight_lb = 100').run()) !== null);
q.setUserWeight('u1', 180); // restore for the board below

// --- the season freeze ---
q.addEntry(GUILD, 'u1', 'pushups', '2026-09-10', 40);
const unfrozen = q.unfrozenClosedSeasons(GUILD);
check('a closed season with entries and no frozen board is reported', unfrozen.length === 1 && unfrozen[0]!.id === 1);
const cli = (args: string[], env: Record<string, string> = {}): { code: number; out: string } => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', join('src', 'scripts', 'approve-exercise.ts'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
};
q.createPendingExercise('zzcli', 'Zz cli');
const refused = cli(['approve', 'zzcli', '--label', 'Zz cli', '--flat', '3', '--table', 'abrolls']);
check('the script refuses to price while a closed season is not frozen', refused.code === 1 && refused.out.includes('not frozen'), refused.out);
check('freezeClosedSeasons freezes it', q.freezeClosedSeasons(GUILD).join() === '1' && q.freezeClosedSeasons(GUILD).length === 0 && q.unfrozenClosedSeasons(GUILD).length === 0);
check('a frozen board cannot be rewritten', throws(() => conn.prepare('UPDATE season_standings SET points = 0').run()) !== null && throws(() => conn.prepare('DELETE FROM season_standings').run()) !== null);

// --- the script's command line ---
const bad: [string, string[]][] = [
  ['--label swallowing the next flag', ['approve', 'k', '--label', '--flat', '5']],
  ['a typo\'d flag', ['approve', 'k', '--label', 'X', '--flat', '5', '--table', 'abrolls', '--assit']],
  ['an empty price', ['approve', 'k', '--label', 'X', '--flat', '', '--table', 'abrolls']],
  ['a non-number price', ['approve', 'k', '--label', 'X', '--flat', 'abc', '--table', 'abrolls']],
  ['a negative price', ['approve', 'k', '--label', 'X', '--flat=-5', '--table', 'abrolls']],
  ['two kinds of price', ['approve', 'k', '--label', 'X', '--flat', '5', '--lift', '1,2,3,4', '--table', 'abrolls']],
  ['no kind of price', ['approve', 'k', '--label', 'X', '--table', 'abrolls']],
  ['three lift anchors', ['approve', 'k', '--label', 'X', '--lift', '1,2,3', '--table', 'row']],
  ['a lift anchor that is not a number', ['approve', 'k', '--label', 'X', '--lift', '1,2,3,x', '--table', 'row']],
  ['--bw without --k', ['approve', 'k', '--label', 'X', '--bw', '6', '--reps', '1,2,3,4', '--table', 'dips']],
  ['--bw with both reps and onerm', ['approve', 'k', '--label', 'X', '--bw', '6', '--k', '1', '--reps', '1,2,3,4', '--onerm', '1,2,3,4', '--table', 'dips']],
  ['--assist with a flat price', ['approve', 'k', '--label', 'X', '--flat', '5', '--assist', '--table', 'abrolls']],
  ['--one-side with a flat price', ['approve', 'k', '--label', 'X', '--flat', '5', '--one-side', '--table', 'abrolls']],
  ['--into on approve', ['approve', 'k', '--label', 'X', '--flat', '5', '--into', 'row', '--table', 'abrolls']],
  ['merge without --into', ['merge', 'k']],
  ['merge with a price', ['merge', 'k', '--into', 'row', '--flat', '5']],
  ['an unknown command', ['price', 'k']],
  ['an extra positional', ['approve', 'k', 'extra', '--label', 'X', '--flat', '5']],
  ['a bad unit', ['approve', 'k', '--label', 'X', '--flat', '5', '--unit', 'furlongs']],
  ['--unit reps spelled out (not a cardio unit)', ['approve', 'k', '--label', 'X', '--flat', '5', '--unit', 'reps', '--table', 'abrolls']],
  ['--unit with a lift', ['approve', 'k', '--label', 'X', '--lift', '1,2,3,4', '--unit', 'flights', '--table', 'row']],
  ['a height family that is not one', ['approve', 'k', '--label', 'X', '--lift', '1,2,3,4', '--height', 'pull', '--table', 'row']],
  ['--height on a bodyweight price', ['approve', 'k', '--label', 'X', '--bw', '12', '--k', '1', '--reps', '2,10,20,32', '--height', 'press', '--table', 'dips']],
];
for (const [name, args] of bad) {
  const parsed = ((): string | null => {
    try {
      const c = parseApproveArgs(args);
      return c.command === 'approve' || c.command === 'merge' ? 'accepted' : null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  })();
  check(`arguments: ${name} is refused`, parsed !== 'accepted', String(parsed));
}
const good = parseApproveArgs(['approve', 'zz', '--label', 'Cable Row', '--lift', '86,123,168,220', '--table', 'row', '--note', 'stack', '--as', 'cablerow', '--dry-run']);
check('arguments: a good command parses to exactly what was typed', good.command === 'approve' && good.pricing.kind === 'lift' && good.pricing.table === 'row' && good.newKey === 'cablerow' && good.dryRun && good.note === 'stack' && good.unit === 'reps');
const g2 = parseApproveArgs(['approve', 'zz', '--label', 'Ring', '--bw', '12', '--k', '1', '--reps', '2,10,20,32', '--assist', '--table', 'dips']);
check('arguments: --assist and --reps land in the bodyweight record', g2.command === 'approve' && g2.pricing.kind === 'bw' && g2.pricing.assist === true && g2.pricing.reps?.join() === '2,10,20,32');
const g3 = parseApproveArgs(['approve', 'k', '--label', 'X', '--lift', '19.5,30.5,44.5,61.5', '--one-side', '--table', 'bicepcurls']);
check('arguments: --one-side lands in the lift record', g3.command === 'approve' && g3.pricing.kind === 'lift' && g3.pricing.oneSide === true);
const g4 = parseApproveArgs(['approve', 'k', '--label', 'X', '--lift', '68,104,150,206', '--table', 'dbbench']);
const g5 = parseApproveArgs(['approve', 'k', '--label', 'X', '--lift', '86,123,168,220', '--height', 'hinge', '--table', 'row']);
const g6 = parseApproveArgs(['approve', 'k', '--label', 'X', '--lift', '86,123,168,220', '--table', 'row']);
check('arguments: a lift on a family table takes its family, --height sets one, and other tables have none',
  g4.command === 'approve' && g4.pricing.kind === 'lift' && g4.pricing.height === 'press' &&
  g5.command === 'approve' && g5.pricing.kind === 'lift' && g5.pricing.height === 'hinge' &&
  g6.command === 'approve' && g6.pricing.kind === 'lift' && g6.pricing.height === undefined);
{
  const both = S.buildCurve({ kind: 'lift', oneRM: [39, 61, 89, 123], table: 'bicepcurls' });
  const one = S.buildCurve({ kind: 'lift', oneRM: [19.5, 30.5, 44.5, 61.5], table: 'bicepcurls', oneSide: true });
  check('scoring: one arm at 10 lb pays half a two-arm rep at 20 lb combined', Math.abs(one(10) - both(20) / 2) < 1e-12);
}
{
  // Split squats count k x body weight as load: an unloaded rep pays, the price rises with load, and each table keeps its own bottom.
  const bar = S.buildCurve(S.catalogPricing('barbellbulgariansplitsquat')!);
  const dumb = S.buildCurve(S.catalogPricing('dbbulgariansplitsquat')!);
  check('scoring: an unloaded split squat pays more than 0 (no weight and 0 lb alike)', bar(null) > 1 && dumb(null) > 0.5 && bar(0) === bar(null));
  check('scoring: the split squat price rises with every pound', [0, 1, 5, 10, 20, 45, 95, 135, 250].every((w, i, a) => i === 0 || (bar(w) > bar(a[i - 1]!) && dumb(w) > dumb(a[i - 1]!))));
  check('pricing: a lift k outside (0, 2] is refused', S.pricingProblem({ kind: 'lift', oneRM: [1, 2, 3, 4], k: 0 }) !== null && S.pricingProblem({ kind: 'lift', oneRM: [1, 2, 3, 4], k: 0.66 }) === null);
  check('scoring: a lift without k still pays 0 with no weight', S.buildCurve(S.catalogPricing('benchpress')!)(null) === 0);
  const dl = S.buildCurve(S.catalogPricing('deadlift')!);
  check('scoring: the deadlift counts head, arms, trunk and thighs, and rises with every pound', S.catalogPricing('deadlift')!.kind === 'lift' && Math.abs((S.catalogPricing('deadlift') as { k?: number }).k! - 0.878) < 1e-12 && [0, 45, 95, 135, 225, 315].every((w, i, a) => i === 0 || dl(w) > dl(a[i - 1]!)));
  check('scoring: the hinges and hip thrust share a body weight rule by table', ['rdl', 'dbrdl'].every((t) => (S.catalogPricing(t) as { k?: number }).k === 0.678) && S.LIFT_BODY_SHARE.goodmorning === 0.678 && Math.abs(S.LIFT_BODY_SHARE.hipthrust! - 0.3619) < 1e-9);
}

// --- the script end to end ---
const noTable = cli(['approve', 'zzcli', '--label', 'Zz cli', '--flat', '3']);
check('the script refuses to price with no --table', noTable.code === 1 && noTable.out.includes('by-bodyweight table') && q.getExercise('zzcli')?.pending === true, noTable.out);
const typo = cli(['approve', 'zzcli', '--label', 'Zz cli', '--flat', '3', '--table', 'constructor']);
check('and a table that is not one (--table constructor)', typo.code === 1 && q.getExercise('zzcli')?.pending === true, typo.out);
const dry = cli(['approve', 'zzcli', '--label', 'Zz cli', '--flat', '3', '--table', 'abrolls', '--dry-run']);
const stillPending = (conn.prepare("SELECT pending FROM exercises WHERE key = 'zzcli'").get() as { pending: number }).pending;
check('--dry-run shows the result and changes nothing', dry.code === 0 && dry.out.includes('DRY RUN') && stillPending === 1, dry.out);
const real = cli(['approve', 'zzcli', '--label', 'Zz cli', '--flat', '3', '--table', 'abrolls']);
invalidateScoring();
check('with a valid table it prices the exercise', real.code === 0 && q.getExercise('zzcli')?.pending === false && q.getExercise('zzcli')?.pricing?.kind === 'flat', real.out);

// --- configuration that is present must be valid ---
const configWith = (env: Record<string, string>): number =>
  spawnSync(process.execPath, ['--import', 'tsx', '-e', "await import('./src/config.ts')"], { encoding: 'utf8', env: { ...process.env, ...env } }).status ?? -1;
check('config: an invalid DAY_CUTOFF_HOUR or RECAP_TIME stops the bot instead of moving the day', configWith({ DAY_CUTOFF_HOUR: '25' }) !== 0 && configWith({ RECAP_TIME: '99:99' }) !== 0 && configWith({ DAY_CUTOFF_HOUR: 'abc' }) !== 0);
check('config: valid values are accepted', configWith({ DAY_CUTOFF_HOUR: '4', RECAP_TIME: '04:05' }) === 0);

// --- player-typed text ---
check('plainText: one line, no control characters', plainText('a\nb\u0000c  d') === 'a b c d');
check('plainText caps its length', plainText('x'.repeat(100), 10).length === 10);

console.log(failures === 0 ? '\nAll guard checks passed.' : `\n${failures} guard check(s) FAILED.`);
process.exit(failures ? 1 : 0);
