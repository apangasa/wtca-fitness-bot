// Builds the command tree offline; discord.js validates names and options at toJSON(), so no token or database is needed.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'out');
mkdirSync(outDir, { recursive: true });
const dbFile = join(outDir, 'check.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) rmSync(f, { force: true });
process.env.DB_PATH = dbFile;

const { buildCommands } = await import('../commands/index.js');

const commands = buildCommands();
const names = [...commands.keys()].sort();

console.log(`${names.length} commands build cleanly:`);
for (const name of names) console.log(`  /${name}`);

let failed = false;
const fail = (msg: string): void => {
  console.error(`FAIL: ${msg}`);
  failed = true;
};

const tooLong = names.filter((n) => n.length > 32);
const illegal = names.filter((n) => !/^[-_a-z0-9]{1,32}$/.test(n));
if (tooLong.length || illegal.length) fail(`invalid command names: ${[...tooLong, ...illegal].join(', ')}`);
// Discord allows 100 guild commands; keep headroom.
if (names.length > 60) fail(`${names.length} commands is too close to Discord's limit of 100`);

for (const gone of ['log', 'lift', 'set', 'config', 'abcrunch', 'addexercise', 'removeexercise', 'leg-press', 'legcurl']) {
  if (commands.has(gone)) fail(`/${gone} should not exist`);
}
const LIFTS = [
  'benchpress', 'narrowbench', 'dbbench', 'overheadpress', 'legpress', 'latpulldown', 'machinelatpulldown', 'row', 'deadlift',
  'rdl', 'bicepcurls', 'triceppushdown', 'cableflies', 'lateralraise', 'seatedlegcurl', 'lyinglegcurl', 'assistedpullups', 'cablecrunch', 'barbellbulgariansplitsquat', 'dbbulgariansplitsquat',
];
for (const kept of ['undo', 'today', 'new', 'queue', 'run', 'swim', 'pushups', 'squats', 'leaderboard', 'me', 'seasons', 'weight', ...LIFTS]) {
  if (!commands.has(kept)) fail(`/${kept} is missing`);
}

const optionsOf = (name: string): { name: string; required?: boolean }[] =>
  (commands.get(name)?.data.options ?? []) as { name: string; required?: boolean }[];
const optionNames = (name: string): string => optionsOf(name).map((o) => o.name).join();

// Every lift needs a weight.
for (const lift of LIFTS) {
  if (optionNames(lift) !== 'reps,weight,sets') fail(`/${lift} options are ${optionNames(lift)}`);
  if (!optionsOf(lift).find((o) => o.name === 'weight')?.required) fail(`/${lift} weight must be required`);
}
// /weight is the body-weight command: set (lbs, required), show (optional user), clear.
const weightOptions = (commands.get('weight')?.data.options ?? []) as { name: string; options?: { name: string; required?: boolean }[] }[];
if (weightOptions.map((o) => o.name).join() !== 'set,show,clear') fail(`/weight subcommands are ${weightOptions.map((o) => o.name).join()}`);
if (!weightOptions[0]?.options?.find((o) => o.name === 'lbs')?.required) fail('/weight set lbs must be required');
// /new takes reps first; a queued exercise never gets a command.
if (optionNames('new') !== 'name,reps,weight,sets,notes') fail(`/new options are ${optionNames('new')}`);
if (!optionsOf('new').find((o) => o.name === 'name')?.required) fail('/new name must be required');
// Squats: no weight is a bodyweight squat.
if (optionNames('squats') !== 'reps,weight') fail(`/squats options are ${optionNames('squats')}`);
if (optionsOf('squats').find((o) => o.name === 'weight')?.required) fail('/squats weight must be optional');
// Exercises counted in reps take "reps"; non-rep units (run) take "amount".
for (const [name, cmd] of commands) {
  const opts = (cmd.data.options ?? []) as { name: string }[];
  if (opts.some((o) => o.name === 'amount') && name !== 'run' && name !== 'swim' && name !== 'planktest') fail(`/${name} still uses "amount"`);
}
// Bodyweight exercises take an optional added load.
for (const name of ['pushups', 'pullups', 'chinups', 'situps', 'calfraises', 'lunges']) {
  if (optionNames(name) !== 'reps,weight') fail(`/${name} options are ${optionNames(name)}`);
  if (optionsOf(name).find((o) => o.name === 'weight')?.required) fail(`/${name} weight must be optional`);
}
// Plain exercises take only reps.
if (optionNames('abrolls') !== 'reps') fail('/abrolls should only take reps');
if (optionNames('run') !== 'amount') fail('/run counts miles, so it should take amount');
if (optionNames('swim') !== 'amount,unit') fail(`/swim options are ${optionNames('swim')}`);
// Typo guards cap one entry (100 miles by slip).
const maxOf = (name: string): number | undefined =>
  ((commands.get(name)?.data.options ?? []) as { name: string; max_value?: number }[]).find((o) => o.name === 'amount')?.max_value;
if (maxOf('run') !== 50) fail(`/run should cap a single entry at 50 miles, not ${maxOf('run')}`);
if (maxOf('swim') !== 10000) fail(`/swim should cap a single entry at 10,000, not ${maxOf('swim')}`);

// /cleanup must keep recaps, season posts and leaderboards, and delete everything else the bot posts.
const { isKeptPost } = await import('../commands/admin.js');
const keptCases: [string, string, string[], boolean][] = [
  ['daily recap', '## Oct 1 WTCA Fitness', ['recap-2026-10-01.png'], true],
  ['recap with blank content', '', ['recap-2026-10-01.png'], true],
  ['season closing post', '## Season 1 is over', ['season-1-final.png'], true],
  ['leaderboard', '', ['leaderboard.png'], true],
  ['log confirmation', '**Alex** +20 push-ups — **40** today', [], false],
  ['/today chart', '**Thu Oct 1**', ['today.png'], false],
  ['/race chart', '', ['race.png'], false],
  ['/me card', '', ['card.png'], false],
  ['/seasons hall of fame', '', ['seasons.png'], false],
];
for (const [name, content, files, expected] of keptCases) {
  if (isKeptPost(content, files) !== expected) fail(`cleanup: ${name} should be ${expected ? 'kept' : 'deleted'}`);
}

// A database row becomes a command.
const { addExercise, removeExercise } = await import('../db/queries.js');
addExercise('planktest', 'Plank Test', 'min', 1);
if (!buildCommands().has('planktest')) fail('a new plain exercise row did not produce a /planktest command');
removeExercise('planktest');
if (buildCommands().has('planktest')) fail('a retired exercise still has a command');

if (failed) process.exit(1);
console.log('Command tree: OK');
