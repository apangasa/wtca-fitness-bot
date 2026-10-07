// Scoring end to end on a throwaway db. `tsx src/scripts/check-weights.ts` migrates an old-schema db and scores it;
// `... reopen` reopens it and checks that tuned values survive a restart.
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'out');
mkdirSync(outDir, { recursive: true });
const dbFile = join(outDir, 'weights.db');
process.env.DB_PATH = dbFile;
const reopen = process.argv[2] === 'reopen';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : detail ? ` — ${detail}` : ''}`);
}
const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;
// Flat bodyweight price worked independently of scoring.ts: mean of 120 / Novice reps and 240 / Intermediate reps.
const implied = (nov: number, int: number): number => (120 / nov + 240 / int) / 2;
const RATE = 180 / 3.5;
const RUN = RATE * (10 + 8 / 60);
const SWIM = (RATE * 2) / 100;

const GUILD = 'g1';

if (!reopen) {
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(f, { force: true });
  // Old-schema database (no pricing records).
  const old = new Database(dbFile);
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, color_slot INTEGER NOT NULL, first_seen TEXT NOT NULL);
    CREATE TABLE exercises (key TEXT PRIMARY KEY, label TEXT NOT NULL, unit TEXT NOT NULL, sort_order INTEGER NOT NULL,
                            active INTEGER NOT NULL DEFAULT 1, points_per_rep REAL NOT NULL DEFAULT 0);
    CREATE TABLE entries (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
                          exercise_key TEXT NOT NULL, day_key TEXT NOT NULL, amount REAL NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO users VALUES ('u-old', 'Riley', 0, '2026-09-01'), ('0', 'a player', 1, '2026-09-02');
    INSERT INTO exercises VALUES ('pushups','Push-ups','reps',0,1,6), ('squats','Squats','reps',5,1,6),
                                 ('lunges','Lunges','reps',10,1,3), ('leg-press','Leg Press','reps',11,1,4),
                                 ('abcrunch','Ab Crunch','reps',12,1,3), ('run','Run','mi',6,1,0),
                                 ('burpees','Burpees','reps',13,1,18), ('wallsit','Wall Sit','reps',14,1,5), ('legcurl','Leg Curl','reps',15,1,0);
    INSERT INTO entries (guild_id,user_id,exercise_key,day_key,amount,created_at) VALUES
      ('g1','u-old','squats','2026-09-10',50,'x'), ('g1','u-old','leg-press','2026-09-24',40,'x'),
      ('g1','u-old','lunges','2026-09-20',30,'x'), ('g1','u-old','abcrunch','2026-09-30',12,'x'), ('g1','u-old','run','2026-09-12',3,'x'),
      ('g1','u-old','wallsit','2026-09-11',10,'x'), ('g1','u-old','legcurl','2026-09-26',10,'x'),
      ('g1','u-old','latpulldown','2026-09-28',8,'x'), ('g1','0','latpulldown','2026-09-28',5,'x');
  `);
  old.close();
}

const q = await import('../db/queries.js');
const { catalogPricing, buildCurve, entryPoints } = await import('../scoring.js');
const { buildCommands } = await import('../commands/index.js');
const { db, invalidateScoring } = await import('../db/index.js');
const { formatPoints } = await import('../exercises.js');

// Model price per rep for a catalog exercise at a weight.
const model = (key: string, weight: number | null): number => buildCurve(catalogPricing(key)!)(weight);
const userVersion = (): number => db().pragma('user_version', { simple: true }) as number;
const PLAYER_A = '0';
const keysOn = (user: string, d: string): string =>
  (db().prepare('SELECT exercise_key FROM entries WHERE user_id = ? AND day_key = ?').all(user, d) as { exercise_key: string }[]).map((e) => e.exercise_key).join();

if (reopen) {
  const bench = q.getExercise('benchpress')!;
  check('reopen: a curve tuned in the database survives a restart', JSON.stringify(bench.pricing) === JSON.stringify({ kind: 'lift', oneRM: [100, 140, 190, 240] }), JSON.stringify(bench.pricing));
  check('reopen: a hand-set run price is not put back to 521 by the migration', q.getExercise('run')!.pricing?.kind === 'flat' && (q.getExercise('run')!.pricing as { p: number }).p === 777);
  check('reopen: burpees tuned to 11 are not repriced again', (q.getExercise('burpees')!.pricing as { p: number }).p === 11);
  check('reopen: the migration did not run again (user_version 6, an emptied record stays empty)', userVersion() === 6 && q.getExercise('abrolls')!.pricing === null);
  check('reopen: the lat pulldown move ran once (the earlier entry stays on the machine lift, a later /latpulldown stays plain)', keysOn(PLAYER_A, '2026-09-28') === 'machinelatpulldown' && keysOn(PLAYER_A, '2026-09-29') === 'latpulldown', `${keysOn(PLAYER_A, '2026-09-28')} / ${keysOn(PLAYER_A, '2026-09-29')}`);
  check('reopen: nothing was duplicated', q.listExercises().filter((e) => e.key === 'benchpress').length === 1);
  check('reopen: a body weight set with /weight survives a restart', q.getUserWeight('u-wt') === 130 && q.userWeightLog().length >= 3);
  q.ensureUser('u-re', 'Reopen');
  const day = '2026-10-05';
  q.addEntry(GUILD, 'u-re', 'benchpress', day, 5, 117);
  const tuned = buildCurve({ kind: 'lift', oneRM: [100, 140, 190, 240] })(117) * 5;
  const row = q.dayTotals(GUILD, day).find((t) => t.userId === 'u-re')!;
  check('reopen: SQL scores with the tuned curve', near(row.points, tuned, 1e-9) && !near(row.points, 5 * model('benchpress', 117), 0.5), `${row.points} vs ${tuned}`);
  q.undoLastEntry(GUILD, 'u-re', day);
  process.exit(failures ? 1 : 0);
}

const squat = q.getExercise('squats')!;
check('squats become weighted, add mode, ref 150', squat.refWeight === 150 && squat.weightMode === 'add');
check('squats carry the bodyweight curve record', squat.pricing?.kind === 'bw' && near(squat.pricing.p, implied(26, 58)), JSON.stringify(squat.pricing));
check('the old /leg-press key is gone', q.getExercise('leg-press') === null);
const legPress = q.getExercise('legpress')!;
check('leg press is now legpress, a lift priced by its 1RM table', legPress.pricing?.kind === 'lift' && legPress.refWeight !== null, JSON.stringify(legPress.pricing));
const moved = q.dayTotals(GUILD, '2026-09-24')[0];
check('its history moved with it (40 reps)', moved?.exerciseKey === 'legpress' && moved.total === 40);
check('the old /abcrunch key is gone', q.getExercise('abcrunch') === null);
check('the old /legcurl key is gone and its entry moved to seated', q.getExercise('legcurl') === null && q.dayTotals(GUILD, '2026-09-26')[0]?.exerciseKey === 'seatedlegcurl');
const seated = q.getExercise('seatedlegcurl')!;
const lying = q.getExercise('lyinglegcurl')!;
check('seated leg curl: renamed row keeps a lift record on the seated table', seated.label === 'Seated Leg Curl' && seated.pricing?.kind === 'lift' && seated.pricing.table === 'seatedlegcurl' && seated.refWeight !== null, JSON.stringify(seated));
check('lying leg curl is seeded on its own table with the 150 lb row 54/86/127/177', lying.label === 'Lying Leg Curl' && lying.pricing?.kind === 'lift' && lying.pricing.table === 'lyinglegcurl' && lying.pricing.oneRM.join() === '54,86,127,177' && lying.refWeight !== null, JSON.stringify(lying));
check('the same stack weight pays more on the lying curl (its standards are lower, so the weight is rarer)', model('lyinglegcurl', 100) > model('seatedlegcurl', 100));
const cable = q.getExercise('cablecrunch')!;
check('abcrunch became cablecrunch (Cable Crunch, a lift record)', cable.label === 'Cable Crunch' && cable.pricing?.kind === 'lift' && cable.refWeight !== null, JSON.stringify(cable));
const cableMoved = q.dayTotals(GUILD, '2026-09-30')[0];
check('its history moved with it', cableMoved?.exerciseKey === 'cablecrunch' && cableMoved.total === 12);
const lunges = q.getExercise('lunges')!;
check('lunges, hand-made at 3, become weighted and take the flat price 7.4436 (unrounded)', lunges.refWeight === 150 && lunges.weightMode === 'add' && lunges.pricing?.kind === 'bw' && near(lunges.pricing.p, implied(14, 38)), JSON.stringify(lunges));
const wallsit = q.getExercise('wallsit')!;
check('a hand-made exercise that is not in the catalog is left alone (no record, legacy 5)', wallsit.refWeight === null && wallsit.pointsPerRep === 5 && wallsit.pricing === null);
const bwKinds = ['pullups', 'chinups', 'pushups', 'situps', 'calfraises'] as const;
check('pull-ups, chin-ups, push-ups, sit-ups and calf-raises carry bodyweight curves', bwKinds.every((k) => q.getExercise(k)!.pricing?.kind === 'bw'));
const burpees = q.getExercise('burpees')!;
check('burpees repriced 18 -> 9.4286 (unrounded)', burpees.pricing?.kind === 'flat' && near(burpees.pricing.p, implied(10, 35)) && burpees.refWeight === null, JSON.stringify(burpees));
check('the new lifts were added with records', ['benchpress', 'assistedpullups', 'lateralraise'].every((k) => q.getExercise(k)?.pricing));
// (dips, leg raise, singlelegpress, facepulls, hammercurls, bentoverrow, inclinecurls exist only in the live database, not in the seed)
check('every seeded lift has a lift record', ['benchpress', 'narrowbench', 'dbbench', 'overheadpress', 'legpress', 'latpulldown', 'row', 'deadlift', 'rdl', 'bicepcurls', 'triceppushdown', 'lateralraise', 'seatedlegcurl', 'lyinglegcurl', 'cableflies', 'cablecrunch'].every((k) => q.getExercise(k)?.pricing?.kind === 'lift'));
const orders = q.listExercises().map((e) => e.sortOrder);
check('sort order has no collisions', new Set(orders).size === orders.length, orders.join(','));

const riley = q.dayTotals(GUILD, '2026-09-10').find((t) => t.exerciseKey === 'squats');
check('50 old squats score 50 x 4.3767 (unrounded)', riley !== undefined && near(riley.points, 50 * implied(26, 58)), `${riley?.points}`);
check('30 old lunges reprice with the row: 30 x 7.4436', near(q.dayTotals(GUILD, '2026-09-20')[0]!.points, 30 * implied(14, 38)));
check('old leg press entry was backfilled as 150 lb and scores the leg press curve at 150 lb', near(q.dayTotals(GUILD, '2026-09-24')[0]!.points, 40 * model('legpress', 150)));
check('the backfill touched only the leg press', q.dayTotals(GUILD, '2026-09-20')[0]!.exerciseKey === 'lunges');
check('a record-less exercise still scores by its legacy price (10 wall sits x 5 = 50)', near(q.dayTotals(GUILD, '2026-09-11')[0]!.points, 50));

const runEx = q.getExercise('run')!;
check('run now pays 521.14 a mile (180 / 3.5 x 10:08)', runEx.pricing?.kind === 'flat' && near(runEx.pricing.p, RUN) && runEx.unit === 'mi', JSON.stringify(runEx));
const oldRun = q.dayTotals(GUILD, '2026-09-12').find((t) => t.exerciseKey === 'run');
check('the 3-mile run logged before was backfilled to 3 x 521.14', !!oldRun && near(oldRun.points, 3 * RUN), String(oldRun?.points));
const swimEx = q.getExercise('swim');
check('swim exists at 1.0286 per yard', swimEx?.pricing?.kind === 'flat' && near(swimEx.pricing.p, SWIM) && swimEx.unit === 'yd', JSON.stringify(swimEx));
check('the one-shot upgrades are recorded (user_version 6)', userVersion() === 6);
const machineLat = q.getExercise('machinelatpulldown')!;
check('machine lat pulldown is seeded as a lift on the lat pulldown anchors and table', machineLat.label === 'Machine Lat Pulldown' && machineLat.pricing?.kind === 'lift' && machineLat.pricing.table === 'machinelatpulldown' && machineLat.pricing.oneRM.join() === '89,124,166,215' && machineLat.refWeight !== null, JSON.stringify(machineLat));
check('until a ratio is chosen it prices exactly like the plain lat pulldown, at 150 lb and at 220 lb', [150, 220].every((bw) => near(buildCurve(catalogPricing('machinelatpulldown')!, bw)(180), buildCurve(catalogPricing('latpulldown')!, bw)(180), 1e-9)));
check("a player's earlier lat pulldown moved to the machine lift", keysOn(PLAYER_A, '2026-09-28') === 'machinelatpulldown', keysOn(PLAYER_A, '2026-09-28'));
check("another person's lat pulldown stayed on the plain lift", keysOn('u-old', '2026-09-28') === 'latpulldown', keysOn('u-old', '2026-09-28'));
// Logged after the migration: must still be there as a plain lat pulldown when the reopen run starts.
q.addEntry(GUILD, PLAYER_A, 'latpulldown', '2026-09-29', 3, 100);

// Per-rep prices straight from the curves (no database).
const spec = (name: string, got: number, want: number, tol: number): void =>
  check(`${name}: ${got.toFixed(3)} (want ${want} +/- ${tol})`, near(got, want, tol));
// The doc's figures are rounded, so these allow half a percent.
spec('bench 5 reps @ 117 lb = 86 points', entryPoints(buildCurve(catalogPricing('benchpress')!), 5, 117), 86, 0.6);
spec('bench @ 117 lb pays 17.2 a rep', model('benchpress', 117), 17.2, 17.2 * 0.005);
spec('bodyweight pull-up rep = 17.1 (unrounded 17.1429)', model('pullups', null), 17.1, 17.1 * 0.005);
spec('bodyweight pull-up rep is exactly the flat mean', model('pullups', null), implied(7, 14), 1e-12);
spec('pull-up with weight 0 = its bodyweight price', model('pullups', 0), implied(7, 14), 1e-12);
spec('hammer curl 50 lb combined = 15.88 a rep', model('hammercurls', 50), 15.88, 15.88 * 0.005);
spec('bench @ 100 lb = 9.83 a rep', model('benchpress', 100), 9.83, 9.83 * 0.005);
spec('bench single at 200 lb = 53', model('benchpress', 200), 53, 0.6);
spec('squat with a 185 lb bar = about 21.8 a rep (0.5%)', model('squats', 185), 21.8, 21.8 * 0.005);
spec('bodyweight squat = 4.4 (unrounded 4.3767)', model('squats', null), 4.4, 0.03);
spec('bodyweight squat is exactly the flat mean', model('squats', null), implied(26, 58), 1e-12);
spec('cable crunch 40 lb stack = 4.07 a rep', model('cablecrunch', 40), 4.07, 0.03);
spec('assisted pull-up with 20 lb assistance = 7.7 a rep', model('assistedpullups', 20), 7.7, 0.06);
spec('assisted pull-up with no assistance = the pull-up price', model('assistedpullups', 0), implied(7, 14), 1e-12);
spec('zero weight on a lift scores 0', model('benchpress', 0), 0, 0);
spec('no weight on a lift scores 0', model('benchpress', null), 0, 0);
const assistTable = [0, 10, 20, 30, 40, 50].map((a) => model('assistedpullups', a));
check(`assisted pull-up table (docs/points-lifts.md) within 0.15: ${assistTable.map((x) => x.toFixed(1)).join(' ')}`, [17.1, 12.5, 7.7, 4.5, 2.6, 1.4].every((v, i) => near(assistTable[i]!, v, 0.15)));
const squatTable = [0, 45, 90, 135, 185, 225].map((a) => model('squats', a));
check(`squat table (docs/points-lifts.md) within 0.2: ${squatTable.map((x) => x.toFixed(1)).join(' ')}`, [4.4, 8.3, 13.1, 17.0, 21.8, 25.5].every((v, i) => near(squatTable[i]!, v, 0.2)));
const ccTable = [20, 30, 40, 60].map((w) => model('cablecrunch', w));
check(`cable crunch (docs/points-lifts.md) 0.8 / 2.0 / 4.1 / 10.9: ${ccTable.map((x) => x.toFixed(2)).join(' ')}`, [0.8, 2.0, 4.1, 10.9].every((v, i) => near(ccTable[i]!, v, 0.1)));
const flats: [string, number][] = [['pushups', implied(20, 40)], ['pullups', implied(7, 14)], ['dips', implied(10, 20)], ['chinups', implied(8, 14)], ['situps', implied(27, 57)], ['legraise', implied(12, 31)], ['squats', implied(26, 58)], ['lunges', implied(14, 38)], ['abrolls', implied(7, 21)], ['abrollsassisted', implied(7, 21) * 0.64], ['burpees', implied(10, 35)], ['calfraises', 1.4], ['flightofstairs', 0], ['anklealphabet', 0], ['run', RUN], ['swim', SWIM]];
check('every flat price is derived and unrounded (Parts 2, 4, 5): push-up 6, run 521.14, swim 1.0286', flats.every(([k, p]) => near(model(k, null), p, 1e-9)), flats.filter(([k, p]) => !near(model(k, null), p, 1e-9)).join(' '));
const anchors = [3.75, 15, 30, 48];
check('bench pays 3.75 / 15 / 30 / 48 at its 8-rep anchor weights (29/36 of 1RM)', [99, 137, 183, 236].every((r, i) => near(model('benchpress', (29 / 36) * r), anchors[i]!, 1e-9)));

q.ensureUser('u1', 'Tester');
const day = '2026-10-05';
const cases: { key: string; weight: number | null; reps: number; perRep: number }[] = [
  { key: 'benchpress', weight: 135, reps: 1, perRep: model('benchpress', 135) },
  { key: 'benchpress', weight: 117, reps: 5, perRep: model('benchpress', 117) },
  { key: 'benchpress', weight: null, reps: 1, perRep: 0 }, // a lift with no weight is unpriced
  { key: 'benchpress', weight: 0, reps: 1, perRep: 0 },
  { key: 'squats', weight: 185, reps: 1, perRep: model('squats', 185) },
  { key: 'squats', weight: null, reps: 1, perRep: implied(26, 58) },
  { key: 'assistedpullups', weight: 85, reps: 1, perRep: model('assistedpullups', 85) },
  { key: 'deadlift', weight: 165, reps: 1, perRep: model('deadlift', 165) },
  { key: 'latpulldown', weight: 150, reps: 1, perRep: model('latpulldown', 150) },
  { key: 'cablecrunch', weight: 40, reps: 1, perRep: model('cablecrunch', 40) },
  { key: 'seatedlegcurl', weight: 100, reps: 1, perRep: model('seatedlegcurl', 100) },
  { key: 'lyinglegcurl', weight: 100, reps: 1, perRep: model('lyinglegcurl', 100) },
  { key: 'narrowbench', weight: 135, reps: 1, perRep: model('narrowbench', 135) },
  { key: 'pullups', weight: 25, reps: 1, perRep: model('pullups', 25) },
  { key: 'chinups', weight: 25, reps: 1, perRep: model('chinups', 25) },
  { key: 'pushups', weight: 25, reps: 1, perRep: model('pushups', 25) },
  { key: 'situps', weight: 25, reps: 1, perRep: model('situps', 25) },
  { key: 'calfraises', weight: 25, reps: 1, perRep: model('calfraises', 25) },
  { key: 'lunges', weight: 25, reps: 1, perRep: model('lunges', 25) },
  { key: 'pushups', weight: null, reps: 1, perRep: 6 }, // no weight -> the bodyweight price
  { key: 'burpees', weight: null, reps: 1, perRep: implied(10, 35) },
];
for (const c of cases) {
  const ex = q.getExercise(c.key)!;
  const ts = q.priceAt(ex, c.weight);
  q.addEntry(GUILD, 'u1', c.key, day, c.reps, c.weight);
  const row = q.dayTotals(GUILD, day).find((t) => t.userId === 'u1' && t.exerciseKey === c.key)!;
  check(
    `${c.key} @ ${c.weight ?? 'none'} = ${c.perRep.toFixed(2)}/rep (SQL ${(row.points / c.reps).toFixed(4)}, TS ${ts.toFixed(4)})`,
    near(row.points / c.reps, c.perRep, 0.005) && near(row.points, ts * c.reps, 1e-9),
  );
  q.undoLastEntry(GUILD, 'u1', day, c.key);
}

// Sets at different weights are priced separately, then summed.
q.addEntry(GUILD, 'u1', 'benchpress', day, 8, 115);
q.addEntry(GUILD, 'u1', 'benchpress', day, 8, 135);
const benchRow = q.dayTotals(GUILD, day).find((t) => t.exerciseKey === 'benchpress')!;
check('mixed-weight day sums per set', near(benchRow.points, 8 * model('benchpress', 115) + 8 * model('benchpress', 135)) && benchRow.total === 16);
const detail = q.dayDetails(GUILD, day).filter((d) => d.exerciseKey === 'benchpress');
check('day detail keeps the weights apart', detail.length === 2 && detail.map((d) => d.weight).join() === '115,135');
const board = q.scoreboard(GUILD, day, day).find((r) => r.userId === 'u1')!;
check('scoreboard agrees with the day total', near(board.points, benchRow.points));
q.undoLastEntry(GUILD, 'u1', day, 'benchpress');
q.undoLastEntry(GUILD, 'u1', day, 'benchpress');

// Sets at one weight combine exactly.
q.ensureUser('u-sets', 'Sets');
for (let i = 0; i < 3; i++) q.addEntry(GUILD, 'u-sets', 'benchpress', day, 8, 135);
q.ensureUser('u-one', 'One');
q.addEntry(GUILD, 'u-one', 'benchpress', day, 24, 135);
const threeSets = q.dayTotals(GUILD, day).find((t) => t.userId === 'u-sets')!;
const oneSet = q.dayTotals(GUILD, day).find((t) => t.userId === 'u-one')!;
check('3 sets of 8 at one weight equal 24 reps at that weight', near(threeSets.points, oneSet.points, 1e-9) && near(oneSet.points, 24 * model('benchpress', 135), 1e-9), `${threeSets.points} vs ${oneSet.points}`);
for (let i = 0; i < 3; i++) q.undoLastEntry(GUILD, 'u-sets', day);
q.undoLastEntry(GUILD, 'u-one', day);

const { samePoints } = await import('../exercises.js');
check('motivating case: 0.1 + 0.2 is not === 0.3', 0.1 + 0.2 !== 0.3);
check('samePoints treats that as equal', samePoints(0.1 + 0.2, 0.3));
check('samePoints still tells 1 point apart', !samePoints(100, 101) && !samePoints(100, 100.01));
// The same sets summed in two orders tie but differ in the last float bit.
const addUp = (weights: number[]): number => weights.reduce((sum, w) => sum + (7 * 6 * w) / 100, 0);
const orderA = addUp([115, 135, 95]);
const orderB = addUp([95, 135, 115]);
check('the same sets summed in a different order differ in floating point', orderA !== orderB, `${orderA} vs ${orderB}`);
check('samePoints still calls that a tie', samePoints(orderA, orderB));
// SQLite's SUM compensates, but not every total comes from SQL.
q.ensureUser('tie-a', 'A');
q.ensureUser('tie-b', 'B');
const tieDay = '2026-10-06';
for (const w of [115, 135, 95]) q.addEntry(GUILD, 'tie-a', 'benchpress', tieDay, 7, w);
for (const w of [95, 135, 115]) q.addEntry(GUILD, 'tie-b', 'benchpress', tieDay, 7, w);
const tied = q.scoreboard(GUILD, tieDay, tieDay);
check('identical weighted days tie on the database scoreboard', tied.length === 2 && samePoints(tied[0]!.points, tied[1]!.points), tied.map((t) => t.points).join(' vs '));

const commands = buildCommands();
const live = (name: string) => commands.get(name)!;

interface Fake {
  replies: string[];
  ephemeral: boolean[];
}
function interact(opts: {
  user: string;
  strings?: Record<string, string>;
  numbers?: Record<string, number>;
  integers?: Record<string, number>;
  sub?: string;
  users?: Record<string, string>;
}): [Record<string, unknown>, Fake] {
  const fake: Fake = { replies: [], ephemeral: [] };
  const interaction = {
    guildId: GUILD,
    user: { id: opts.user, displayName: opts.user, username: opts.user },
    member: null,
    options: {
      getString: (n: string) => opts.strings?.[n] ?? null,
      getNumber: (n: string) => opts.numbers?.[n] ?? null,
      getInteger: (n: string) => opts.integers?.[n] ?? null,
      getSubcommand: () => opts.sub ?? '',
      getUser: (n: string) => (opts.users?.[n] ? { id: opts.users[n], displayName: opts.users[n] } : null),
    },
    reply: async (x: string | { content: string; flags?: number }) => {
      fake.replies.push(typeof x === 'string' ? x : x.content);
      fake.ephemeral.push(typeof x !== 'string' && x.flags !== undefined);
    },
  };
  return [interaction, fake];
}
async function run(name: string, opts: Parameters<typeof interact>[0]): Promise<Fake> {
  const [interaction, fake] = interact(opts);
  await live(name).execute(interaction as never);
  return fake;
}

let r = await run('benchpress', { user: 'u-new', integers: { reps: 8 } });
check('a lift with no weight is refused', r.ephemeral[0] === true && r.replies[0]!.includes('needs a weight'), r.replies[0]);
check('a refused lift creates no entry', q.getUser('u-new') === null);

r = await run('benchpress', { user: 'u-new', integers: { reps: 8, sets: 3 }, numbers: { weight: 135 } });
const bench135 = formatPoints(24 * model('benchpress', 135));
check(`3 sets of 8 @ 135 logs 24 reps for ${bench135} pts`, r.replies[0]!.includes(`${bench135} pts`) && r.replies[0]!.includes('3×8'), r.replies[0]);
check('the reply restates what weight means for the lift', r.replies[0]!.includes('bar + plates'), r.replies[0]);

r = await run('benchpress', { user: 'u-new', integers: { reps: 5 } });
check('a second set still needs its own weight (no reuse)', r.ephemeral[0] === true, r.replies[0]);

r = await run('assistedpullups', { user: 'u-new', integers: { reps: 5 }, numbers: { weight: 150 } });
check('assistance of 150+ is refused', r.ephemeral[0] === true && r.replies[0]!.includes('score 0'), r.replies[0]);

r = await run('legpress', { user: 'u-new', integers: { reps: 10 }, numbers: { weight: 200 } });
check('/legpress works and says its price per rep', r.replies[0]!.includes(`${formatPoints(model('legpress', 200))}/rep`), r.replies[0]);

r = await run('squats', { user: 'u-new', integers: { reps: 20 } });
check('bodyweight squats keep the old reply format', r.replies[0]!.includes('+20 squats') && !r.replies[0]!.includes('pts'), r.replies[0]);

r = await run('squats', { user: 'u-new', integers: { reps: 10 }, numbers: { weight: 185 } });
check('loaded squat shows its price per rep (21.8)', r.replies[0]!.includes(formatPoints(model('squats', 185)) + '/rep'), r.replies[0]);

r = await run('undo', { user: 'u-new', strings: { exercise: 'squats' } });
check('/undo names the weight it removed', r.replies[0]!.includes('10 reps squats @ 185 lb'), r.replies[0]);

const { dayKeyFor } = await import('../time.js');
r = await run('run', { user: 'u-c', numbers: { amount: 3.1 } });
check('/run pays 521.14 a mile and says so (3.1 mi)', r.replies[0]!.includes('+3.1mi run') && r.replies[0]!.includes('+' + formatPoints(3.1 * RUN) + ' pts'), r.replies[0]);
r = await run('swim', { user: 'u-c', numbers: { amount: 1000 } });
check('/swim 1000 yd pays 1,028.6', r.replies[0]!.includes('+1000yd swim') && r.replies[0]!.includes('+' + formatPoints(1000 * SWIM) + ' pts'), r.replies[0]);
r = await run('swim', { user: 'u-c', numbers: { amount: 1000 }, strings: { unit: 'm' } });
const swimMeters = formatPoints(1000 * 1.0936133 * SWIM);
check(`/swim 1000 m converts to 1093.61 yd and pays ${swimMeters}`, r.replies[0]!.includes('1093.61yd') && r.replies[0]!.includes(`+${swimMeters} pts`), r.replies[0]);
const cTotals = q.dayTotals(GUILD, dayKeyFor()).filter((t) => t.userId === 'u-c');
check('the database agrees: 3.1 mi + 1000 yd + 1000 m', near(cTotals.reduce((sum, t) => sum + t.points, 0), 3.1 * RUN + 1000 * SWIM + 1000 * 1.0936133 * SWIM, 1e-6), cTotals.map((t) => t.points).join(' + '));
const cardioBoard = q.scoreboard(GUILD, dayKeyFor(), dayKeyFor()).find((b) => b.userId === 'u-c');
check('cardio counts toward the points board but not the rep count', !!cardioBoard && cardioBoard.points > 3000 && cardioBoard.reps === 0, JSON.stringify(cardioBoard));
q.undoLastEntry(GUILD, 'u-c', dayKeyFor());
q.undoLastEntry(GUILD, 'u-c', dayKeyFor());
q.undoLastEntry(GUILD, 'u-c', dayKeyFor());

const todayKey = dayKeyFor();
const totalsFor = (key: string) => q.dayTotals(GUILD, todayKey).filter((t) => t.exerciseKey === key);

r = await run('new', { user: 'u-a', strings: { name: 'cable row', notes: 'one arm' }, integers: { reps: 12 }, numbers: { weight: 40 } });
check('/new queues an unknown exercise and says it is pending', r.replies[0]!.includes('pending') && r.replies[0]!.includes('Cable row'), r.replies[0]);
const queued = q.getExercise('cablerow');
check(
  'it is a pending exercise priced at 0, with the note kept',
  !!queued && queued.pending && queued.pointsPerRep === 0 && queued.pricing === null && queued.weightNote === 'one arm' && queued.label === 'Cable row (pending)',
  JSON.stringify(queued),
);

r = await run('new', { user: 'u-b', strings: { name: 'Cable Rows', notes: 'seated' }, integers: { reps: 10, sets: 2 }, numbers: { weight: 50 } });
check('a second person typing it differently lands on the same pending exercise', q.listExercises().filter((e) => e.pending).length === 1, r.replies[0]);
check('both notes are kept', q.getExercise('cablerow')!.weightNote === 'one arm; seated');

const waiting = totalsFor('cablerow');
check('pending entries score 0 points', waiting.length === 2 && waiting.every((t) => t.points === 0));
check('but the reps are recorded (12 and 20)', waiting.map((t) => t.total).sort((a, b) => a - b).join() === '12,20');
check('a pending exercise gets no slash command', !buildCommands().has('cablerow'));

r = await run('new', { user: 'u-a', strings: { name: 'Bench Press' }, integers: { reps: 5 }, numbers: { weight: 100 } });
check('/new on an exercise that exists points to its command', r.ephemeral[0] === true && r.replies[0]!.includes('/benchpress'), r.replies[0]);
r = await run('new', { user: 'u-a', strings: { name: 'push-up' }, integers: { reps: 5 } });
check('hyphens and plurals still match (push-up = Push-ups)', r.ephemeral[0] === true && r.replies[0]!.includes('/pushups'), r.replies[0]);
r = await run('new', { user: 'u-a', strings: { name: 'undo' }, integers: { reps: 5 } });
check('a command name cannot be queued as an exercise', r.ephemeral[0] === true && r.replies[0]!.includes('command'), r.replies[0]);
r = await run('new', { user: 'u-a', strings: { name: '!!!' }, integers: { reps: 5 } });
check('a name with no letters is refused', r.ephemeral[0] === true, r.replies[0]);

r = await run('queue', { user: 'u-a' });
check('/queue lists it with who logged it and the notes', ['Cable row', 'u-a', 'u-b', 'seated'].every((t) => r.replies[0]!.includes(t)), r.replies[0]);

r = await run('undo', { user: 'u-b', strings: { exercise: 'cablerow' } });
check('/undo works on a pending entry and names it', r.replies[0]!.includes('Removed 20 reps') && r.replies[0]!.includes('@ 50 lb'), r.replies[0]);
await run('new', { user: 'u-b', strings: { name: 'cable row' }, integers: { reps: 10, sets: 2 }, numbers: { weight: 50 } });

// Approve prices the row; entries already logged are scored with no extra step.
const rowAnchors = [86, 123, 168, 220];
const approved = q.approveExercise('cablerow', { label: 'Cable Row', pricing: { kind: 'lift', oneRM: rowAnchors }, note: 'stack setting' });
check('approving clears pending and applies the final label and note', !!approved && !approved.pending && approved.label === 'Cable Row' && approved.weightNote === 'stack setting');
check('and it is a weighted lift that needs a weight, with a lift record', !!approved && approved.pricing?.kind === 'lift' && approved.refWeight !== null && approved.weightMode === 'load', JSON.stringify(approved));
const rowCurve = buildCurve({ kind: 'lift', oneRM: rowAnchors });
const priced = totalsFor('cablerow');
const pa = priced.find((t) => t.userId === 'u-a');
const pb = priced.find((t) => t.userId === 'u-b');
check('every entry was backfilled: 12 @ 40 and 20 @ 50 on the new lift curve', !!pa && !!pb && near(pa.points, 12 * rowCurve(40)) && near(pb.points, 20 * rowCurve(50)), `${pa?.points} / ${pb?.points}`);
check('it now has its own command', buildCommands().has('cablerow'));
r = await run('queue', { user: 'u-a' });
check('/queue is empty again', r.replies[0]!.includes('Nothing is waiting'), r.replies[0]);
check('approving twice does nothing', q.approveExercise('cablerow', { label: 'x', pricing: { kind: 'flat', p: 1 } }) === null);
check('a normal exercise cannot be re-priced through approve', q.approveExercise('benchpress', { label: 'x', pricing: { kind: 'flat', p: 1 } }) === null);
check('a bad price is rejected', (() => { try { q.approveExercise('cablerow', { label: 'x', pricing: { kind: 'flat', p: -1 } }); return false; } catch { return true; } })());
check('a lift with the wrong number of anchors is rejected', (() => { try { q.approveExercise('cablerow', { label: 'x', pricing: { kind: 'lift', oneRM: [1, 2, 3] } }); return false; } catch { return true; } })());

// Flat approval (no weight asked for) and a bodyweight curve.
q.createPendingExercise('plankhold', 'Plank hold');
const flatApproved = q.approveExercise('plankhold', { label: 'Plank hold', pricing: { kind: 'flat', p: 3 } });
check('a flat approval asks for no weight', !!flatApproved && flatApproved.refWeight === null && q.priceAt(flatApproved, null) === 3);
q.createPendingExercise('ringdips', 'Ring dips');
const bwApproved = q.approveExercise('ringdips', { label: 'Ring dips', pricing: { kind: 'bw', p: 14, k: 1, reps: [2, 10, 20, 32] } });
check('a bodyweight approval takes optional added load and pays its flat price with none', !!bwApproved && bwApproved.weightMode === 'add' && bwApproved.refWeight === 150 && near(q.priceAt(bwApproved, null), 14) && q.priceAt(bwApproved, 25) > 14);
q.createPendingExercise('assistedring', 'Assisted ring');
const asApproved = q.approveExercise('assistedring', { label: 'Assisted ring', pricing: { kind: 'bw', p: 14, k: 1, reps: [2, 10, 20, 32], assist: true } });
check('an assisted approval reads the weight as assistance', !!asApproved && asApproved.weightMode === 'assist' && q.priceAt(asApproved, 30) < q.priceAt(asApproved, 10));

// Merge folds a duplicate into the exercise it really was.
await run('new', { user: 'u-a', strings: { name: 'seated row' }, integers: { reps: 8 }, numbers: { weight: 100 } });
check('/new queued it', q.getExercise('seatedrow')?.pending === true);
const mergedCount = q.mergeExercise('seatedrow', 'row');
check('merging moves its entries and removes the pending row', mergedCount === 1 && q.getExercise('seatedrow') === null);
const rowRow = totalsFor('row').find((t) => t.userId === 'u-a');
check('and they score at the target price (8 reps @ 100 on row)', !!rowRow && near(rowRow.points, 8 * model('row', 100)), `${rowRow?.points}`);
q.createPendingExercise('zzone', 'Zz one');
check('cannot merge into itself, from a normal exercise, or into a pending one', q.mergeExercise('zzone', 'zzone') === null && q.mergeExercise('benchpress', 'row') === null && q.mergeExercise('zzone', 'zzone2') === null);

// The approve script is a separate process: its write must be noticed without a restart.
{
  const other = new Database(dbFile);
  q.addEntry(GUILD, 'u1', 'burpees', day, 10, null);
  const before = q.dayTotals(GUILD, day).find((t) => t.userId === 'u1' && t.exerciseKey === 'burpees')!.points;
  other.prepare("UPDATE exercises SET pricing = '{\"kind\":\"flat\",\"p\":20}' WHERE key = 'burpees'").run();
  const after = q.dayTotals(GUILD, day).find((t) => t.userId === 'u1' && t.exerciseKey === 'burpees')!.points;
  check('an edit from another connection is scored at once, no restart', near(before, 10 * implied(10, 35)) && near(after, 200), `${before} -> ${after}`);
  other.prepare("UPDATE exercises SET pricing = '{\"kind\":\"flat\",\"p\":9.428571428571429}' WHERE key = 'burpees'").run();
  other.close();
  q.undoLastEntry(GUILD, 'u1', day, 'burpees');
}

const T = await import('../strengthLevelTables.js');
const S = await import('../scoring.js');
const { LIFT_1RM } = S;
{
  const eq = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
  check('every lift table has a 150 lb row equal to the anchors in scoring.ts (default users unchanged)', Object.keys(LIFT_1RM).every((k) => eq(T.tableAt(T.LIFT_TABLES[k]!, 150), LIFT_1RM[k]!)), Object.keys(LIFT_1RM).filter((k) => !eq(T.tableAt(T.LIFT_TABLES[k]!, 150), LIFT_1RM[k]!)).join());
  check('every weighted-bodyweight table has a 150 lb row equal to the curve data in scoring.ts',
    Object.entries(S.BODYWEIGHT).every(([k, b]) => eq(T.tableAt(T.BODYWEIGHT_TABLES[b.table!]!, 150), (b.reps ?? b.oneRM)!)), '');
  check('120 lb fixtures: bench 70/102/142/189, deadlift 116/168/233/308', eq(T.tableAt(T.LIFT_TABLES.benchpress!, 120), [70, 102, 142, 189]) && eq(T.tableAt(T.LIFT_TABLES.deadlift!, 120), [116, 168, 233, 308]));
  check('120 lb fixtures: push-up reps 2/19/42/69, sit-up reps 6/30/66/109', eq(T.tableAt(T.REPS_TABLES.pushups!, 120), [2, 19, 42, 69]) && eq(T.tableAt(T.REPS_TABLES.situps!, 120), [6, 30, 66, 109]));
  check('120 lb fixture: pull-up added-weight row -10/+19/+54/+92 (reps <1/7/14/24 give 110/139/174/212 effective at B = 120)', eq(T.tableAt(T.PULLUP_EFFECTIVE, 120), [110, 139, 174, 212]));
  const mid = T.tableAt(T.LIFT_TABLES.benchpress!, 135);
  const lo = T.tableAt(T.LIFT_TABLES.benchpress!, 120);
  const hi = T.tableAt(T.LIFT_TABLES.benchpress!, 150);
  check('interpolation at 135 lb lies between the 120 and 150 lb rows', mid.every((v, i) => v > lo[i]! && v < hi[i]!), mid.join());
  check('the range is 110 to 310 lb and clamps outside it', T.inBodyweightRange(110) && T.inBodyweightRange(310) && !T.inBodyweightRange(109.9) && !T.inBodyweightRange(311) && eq(T.tableAt(T.LIFT_TABLES.benchpress!, 50), T.tableAt(T.LIFT_TABLES.benchpress!, 110)));

  // Weighted bodyweight curve at B = 150 equals the plain construction.
  const man = (k: number, reps: number[], p: number, w: number): number => {
    const off = k * 150;
    const price = S.liftPrice(reps.map((r) => off / S.repsToFraction(r)));
    return (p / price(off)) * price(off + w);
  };
  check('weighted bodyweight curve at B = 150 equals the plain construction (push-up, squat)',
    near(S.buildCurve(S.catalogPricing('pushups')!, 150)(25), man(0.7, [5, 20, 40, 64], 6, 25), 1e-12) &&
      near(S.buildCurve(S.catalogPricing('squats')!, 150)(185), man(1, [3, 26, 58, 98], implied(26, 58), 185), 1e-12));
  {
    // Every no-load price is p150 x implied(row at B) / implied(row at 150).
    const impliedAt = (key: string, b: number): number => { const r = T.tableAt(T.REPS_TABLES[key]!, b); return implied(r[1], r[2]); };
    const expected = (key: string, table: string, p150: number, b: number): number => p150 * (impliedAt(table, b) / impliedAt(table, 150));
    const rows: [string, string, number][] = [
      ['pushups', 'pushups', 6], ['pullups', 'pullups', implied(7, 14)], ['assistedpullups', 'pullups', implied(7, 14)], ['chinups', 'chinups', implied(8, 14)],
      ['dips', 'dips', implied(10, 20)], ['situps', 'situps', implied(27, 57)], ['squats', 'squats', implied(26, 58)], ['lunges', 'lunges', implied(14, 38)],
      ['calfraises', 'calfraises', 1.4], ['abrolls', 'abrolls', implied(7, 21)], ['abrollsassisted', 'abrolls', implied(7, 21) * 0.64],
      ['burpees', 'burpees', implied(10, 35)], ['legraise', 'legraise', implied(12, 31)],
    ];
    const bad: string[] = [];
    for (const b of [110, 120, 135, 150, 200, 310]) {
      for (const [key, table, p150] of rows) {
        const got = S.buildCurve(S.catalogPricing(key)!, b)(key === 'assistedpullups' ? 0 : null);
        if (!near(got, expected(key, table, p150, b), 1e-9)) bad.push(key + '@' + b);
      }
    }
    check('every bodyweight exercise pays the price from the person\'s own weight-class row (110-310 lb)', bad.length === 0, bad.join());
    check('at 150 lb every bodyweight price is the 150 lb price', rows.every(([key, , p150]) => near(S.buildCurve(S.catalogPricing(key)!, 150)(key === 'assistedpullups' ? 0 : null), p150, 1e-12)));
    check('a 120 lb person: push-up, ab-roll, burpee and leg raise pay the row-derived prices',
      near(S.buildCurve(S.catalogPricing('pushups')!, 120)(null), implied(19, 42), 1e-9) && near(S.buildCurve(S.catalogPricing('abrolls')!, 120)(null), implied(4, 20), 1e-9) &&
        near(S.buildCurve(S.catalogPricing('burpees')!, 120)(null), implied(9, 36), 1e-9) && near(S.buildCurve(S.catalogPricing('legraise')!, 120)(null), implied(11, 33), 1e-9));
    check('calf raise keeps its 1.4 factor and the assisted ab-roll is 0.64 x the person\'s ab-roll price',
      near(S.buildCurve(S.catalogPricing('calfraises')!, 120)(null), 1.4 * (implied(34, 71) / implied(30, 63)), 1e-9) &&
        near(S.buildCurve(S.catalogPricing('abrollsassisted')!, 120)(null), 0.64 * S.buildCurve(S.catalogPricing('abrolls')!, 120)(null), 1e-9));
    check('run and swim do not depend on body weight', [110, 120, 200, 310].every((b) => near(S.buildCurve(S.catalogPricing('run')!, b)(null), RUN, 1e-9) && near(S.buildCurve(S.catalogPricing('swim')!, b)(null), SWIM, 1e-9)));
    check('a plain flat record without a table is the same for everyone', near(S.buildCurve({ kind: 'flat', p: 7 }, 120)(null), 7, 0));
  }
  check('a loaded curve at zero load pays that person\'s flat price (squat, 120 lb)', near(S.buildCurve(S.catalogPricing('squats')!, 120)(0), S.buildCurve({ ...S.catalogPricing('squats')! }, 120)(null), 1e-12) && near(S.buildCurve(S.catalogPricing('squats')!, 120)(null), implied(28, 66), 1e-9));
  check('the loaded curve scales to the person\'s own flat price (squat, 100 lb bar, 120 lb person)', S.buildCurve(S.catalogPricing('squats')!, 120)(100) > S.buildCurve(S.catalogPricing('squats')!, 120)(null));

  q.ensureUser('w-a', 'WA'); q.ensureUser('w-b', 'WB'); q.ensureUser('w-c', 'WC'); q.ensureUser('w-d', 'WD'); q.ensureUser('w-e', 'WE');
  const wd = '2026-10-04';
  const pts = (u: string, key: string): number => q.dayTotals(GUILD, wd).find((t) => t.userId === u && t.exerciseKey === key)?.points ?? NaN;
  for (const u of ['w-a', 'w-b', 'w-c', 'w-d', 'w-e']) {
    q.addEntry(GUILD, u, 'benchpress', wd, 8, 135);
    q.addEntry(GUILD, u, 'pushups', wd, 20, null);
    q.addEntry(GUILD, u, 'squats', wd, 10, 100);
  }
  const base = 8 * model('benchpress', 135);
  check('no body weight set: totals are the 150 lb model (default users unchanged)', near(pts('w-a', 'benchpress'), base, 1e-9));
  check('setting 150 equals unset', (q.setUserWeight('w-c', 150), near(pts('w-c', 'benchpress'), pts('w-a', 'benchpress'), 1e-9) && near(pts('w-c', 'squats'), pts('w-a', 'squats'), 1e-9)));
  q.setUserWeight('w-b', 120);
  check('two users with different weights get different prices for the same entry, with no restart',
    near(pts('w-b', 'benchpress'), 8 * S.buildCurve(S.catalogPricing('benchpress')!, 120)(135), 1e-9) && pts('w-b', 'benchpress') > pts('w-a', 'benchpress'), pts('w-b', 'benchpress') + ' vs ' + pts('w-a', 'benchpress'));
  q.setUserWeight('w-d', 135);
  check('a 135 lb person scores between the 120 and 150 lb persons', pts('w-d', 'benchpress') > pts('w-a', 'benchpress') && pts('w-d', 'benchpress') < pts('w-b', 'benchpress'));
  check('no-load push-ups pay the person\'s row-derived price, and 150 lb pays 6', near(pts('w-b', 'pushups'), 20 * implied(19, 42), 1e-9) && near(pts('w-a', 'pushups'), 20 * 6, 1e-9));
  check('a weighted bodyweight exercise follows the person (squat with 100 lb)', near(pts('w-b', 'squats'), 10 * S.buildCurve(S.catalogPricing('squats')!, 120)(100), 1e-9) && pts('w-b', 'squats') !== pts('w-a', 'squats'));
  // The scoreboard is the sum of the day totals.
  const sbB = q.scoreboard(GUILD, wd, wd).find((r) => r.userId === 'w-b')!;
  check('the scoreboard uses the same personal prices', near(sbB.points, pts('w-b', 'benchpress') + pts('w-b', 'pushups') + pts('w-b', 'squats'), 1e-9));
  check('/weight values outside the table are rejected', [100, 109.99, 311, 1000, NaN].every((b) => { try { q.setUserWeight('w-e', b); return false; } catch (e) { return e instanceof RangeError; } }) && q.getUserWeight('w-e') === null);
  check('the table edges are accepted', (q.setUserWeight('w-e', 110), q.getUserWeight('w-e') === 110) && (q.setUserWeight('w-e', 310), q.getUserWeight('w-e') === 310));
  check('clear restores the default', q.clearUserWeight('w-b') === true && near(pts('w-b', 'benchpress'), pts('w-a', 'benchpress'), 1e-9) && q.getUserWeight('w-b') === null && q.clearUserWeight('w-b') === false);
  const logB = q.userWeightLog().filter((l) => l.userId === 'w-b');
  check('every change is appended to the log (set 120, then a clear as NULL), and clearing nothing logs nothing', logB.length === 2 && logB[0]!.weightLb === 120 && logB[1]!.weightLb === null, JSON.stringify(logB));
  check('the current table holds only live weights', q.listUserWeights().every((w) => w.userId !== 'w-b') && q.listUserWeights().some((w) => w.userId === 'w-d' && w.weightLb === 135));
  {
    // A weight written by another process is scored without a restart.
    const other = new Database(dbFile);
    other.prepare("INSERT OR REPLACE INTO user_weight (user_id, weight_lb, updated_at) VALUES ('w-a', 120, 'x')").run();
    check('a body weight written from another connection is scored at once', near(pts('w-a', 'benchpress'), 8 * S.buildCurve(S.catalogPricing('benchpress')!, 120)(135), 1e-9));
    other.prepare("DELETE FROM user_weight WHERE user_id = 'w-a'").run();
    other.close();
    check('and removing it restores the default', near(pts('w-a', 'benchpress'), base, 1e-9));
  }
  for (const u of ['w-a', 'w-b', 'w-c', 'w-d', 'w-e']) for (let i = 0; i < 3; i++) q.undoLastEntry(GUILD, u, wd);

  // /weight: public replies, errors private, and the logging reply shows the person's own price.
  check('/weight is registered', buildCommands().has('weight') && (buildCommands().get('weight')!.data.options ?? []).map((o) => o.name).join() === 'set,show,clear');
  let w = await run('weight', { user: 'u-wt', sub: 'set', numbers: { lbs: 140 } });
  check('/weight set replies in the channel with the weight and what changes', w.ephemeral[0] === false && w.replies[0]!.includes('140 lb') && w.replies[0]!.includes('150 lb') && q.getUserWeight('u-wt') === 140, w.replies[0]);
  q.ensureUser('u-named', 'Stored');
  w = await run('weight', { user: 'u-named', sub: 'set', numbers: { lbs: 200 } });
  check('/weight set names the person by their stored name, not their Discord name', w.replies[0]!.startsWith('**Stored**') && !w.replies[0]!.includes('u-named'), w.replies[0]);
  w = await run('weight', { user: 'u-wt', sub: 'show', users: { user: 'u-named' } });
  check('/weight show names someone by their stored name', w.replies[0]!.startsWith('**Stored**'), w.replies[0]);
  q.clearUserWeight('u-named');
  w = await run('weight', { user: 'u-wt', sub: 'set', numbers: { lbs: 90 } });
  check('/weight set outside the table is refused, privately, and changes nothing', w.ephemeral[0] === true && w.replies[0]!.includes('110') && w.replies[0]!.includes('310') && q.getUserWeight('u-wt') === 140, w.replies[0]);
  w = await run('weight', { user: 'u-wt', sub: 'set', numbers: { lbs: 130 } });
  w = await run('weight', { user: 'u-wt', sub: 'show' });
  check('/weight show is public and shows their weight', w.ephemeral[0] === false && w.replies[0]!.includes('130 lb'), w.replies[0]);
  w = await run('weight', { user: 'u-other', sub: 'show', users: { user: 'u-wt' } });
  check('/weight show can look up another person', w.ephemeral[0] === false && w.replies[0]!.includes('u-wt') && w.replies[0]!.includes('130 lb'), w.replies[0]);
  w = await run('weight', { user: 'u-other', sub: 'show' });
  check('someone with none set shows as 150 lb', w.ephemeral[0] === false && w.replies[0]!.includes('150 lb') && w.replies[0]!.includes('not set'), w.replies[0]);
  w = await run('weight', { user: 'u-wt', sub: 'clear' });
  check('/weight clear replies in the channel and restores the default', w.ephemeral[0] === false && q.getUserWeight('u-wt') === null, w.replies[0]);
  await run('weight', { user: 'u-wt', sub: 'set', numbers: { lbs: 130 } });
  r = await run('benchpress', { user: 'u-wt', integers: { reps: 8 }, numbers: { weight: 135 } });
  const own = formatPoints(q.priceAt(q.getExercise('benchpress')!, 135, 130));
  check('the per-rep price shown after logging is the person\'s own (130 lb class)', r.replies[0]!.includes('(' + own + '/rep)') && own !== formatPoints(model('benchpress', 135)), r.replies[0]);
  q.undoLastEntry(GUILD, 'u-wt', dayKeyFor());
}

// Tune values as an operator would; the reopen run proves they survive and the migration does not run again.
db().prepare(`UPDATE exercises SET pricing = '{"kind":"flat","p":777}' WHERE key = 'run'`).run();
db().prepare(`UPDATE exercises SET pricing = '{"kind":"lift","oneRM":[100,140,190,240]}' WHERE key = 'benchpress'`).run();
db().prepare(`UPDATE exercises SET pricing = '{"kind":"flat","p":11}' WHERE key = 'burpees'`).run();
db().prepare(`UPDATE exercises SET pricing = NULL WHERE key = 'abrolls'`).run();
invalidateScoring();
check('a record emptied by hand falls back to the legacy price (ab-rolls 14.2857, kept as the display value)', near(q.priceAt(q.getExercise('abrolls')!, null), implied(7, 21), 1e-9));

console.log(failures === 0 ? '\nAll weight checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
