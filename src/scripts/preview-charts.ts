// Seeds a throwaway demo database and renders every chart to ./out; deterministic.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'out');
mkdirSync(outDir, { recursive: true });

// Must be set before config.ts is evaluated, hence the dynamic imports below.
const demoDb = join(outDir, 'demo.db');
rmSync(demoDb, { force: true });
rmSync(`${demoDb}-wal`, { force: true });
rmSync(`${demoDb}-shm`, { force: true });
process.env.DB_PATH = demoDb;

const {
  listExercises,
  ensureUser,
  addEntry,
  dayDetails,
  dayTotals,
  allTimeTotals,
  dailySeries,
  scoreboard,
  bestDayForUser,
  currentStreak,
  daysLogged,
} = await import('../db/queries.js');
const { renderDailyCard, renderLeaderboard, renderTrend, renderPersonalCard, renderHallOfFame } = await import(
  '../render/charts.js'
);
const { currentSeason, seasonRange } = await import('../seasons.js');
const { closeBrowser } = await import('../render/browser.js');
const { dayKeyFor, lastNDayKeys } = await import('../time.js');

const GUILD = 'demo-guild';
const NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Taylor'];

/** mulberry32: small deterministic PRNG. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260812);
const exercises = listExercises();
const users = NAMES.map((n, i) => ensureUser(`demo-${i}`, n));
const days = lastNDayKeys(30);

for (const day of days) {
  for (const user of users) {
    if (rand() < 0.28) continue; // rest day
    // Most people log a few exercises a day.
    const picks = exercises.filter(() => rand() < 0.2);
    for (const ex of picks.length > 0 ? picks : [exercises[0]!]) {
      if (ex.refWeight !== null && ex.weightMode === 'load') {
        // A lift: a few sets near the reference weight, rounded to 5 lb.
        const weight = 5 * Math.round((ex.refWeight * (0.7 + rand() * 0.9)) / 5);
        const sets = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < sets; i++) addEntry(GUILD, user.id, ex.key, day, 6 + Math.floor(rand() * 6), weight);
        continue;
      }
      if (ex.refWeight !== null && ex.weightMode === 'add') {
        addEntry(GUILD, user.id, ex.key, day, 20, rand() < 0.5 ? null : 5 * Math.round(rand() * 20));
        continue;
      }
      const amount =
        ex.unit === 'mi' ? Math.round((1 + rand() * 5) * 4) / 4 : 10 * Math.ceil((5 + rand() * 45) / 10);
      addEntry(GUILD, user.id, ex.key, day, amount);
    }
  }
}

const today = dayKeyFor();

const daily = await renderDailyCard({
  dayKey: today,
  exercises,
  totals: dayTotals(GUILD, today),
  details: dayDetails(GUILD, today),
  guildLabel: 'WTCA',
});
writeFileSync(join(outDir, '01-daily.png'), daily);

const perUser = new Map<string, { name: string; colorSlot: number; value: number }>();
for (const t of allTimeTotals(GUILD)) {
  if (t.points <= 0) continue;
  const cur = perUser.get(t.userId) ?? { name: t.displayName, colorSlot: t.colorSlot, value: 0 };
  cur.value += t.points;
  perUser.set(t.userId, cur);
}
const board = await renderLeaderboard({
  title: 'Points leaderboard',
  subtitle: 'All time — points across every exercise',
  bars: [...perUser.values()],
  unit: 'pts',
  footNote: `${days.length} days tracked`,
});
writeFileSync(join(outDir, '02-alltime.png'), board);

const pushups = await renderLeaderboard({
  title: 'Push-ups',
  subtitle: 'All-time total',
  bars: allTimeTotals(GUILD, 'pushups').map((t) => ({
    name: t.displayName,
    colorSlot: t.colorSlot,
    value: t.total,
  })),
  unit: 'reps',
});
writeFileSync(join(outDir, '03-pushups.png'), pushups);

const bench = await renderLeaderboard({
  title: 'Bench Press',
  subtitle: 'All time — points, so the weight counts',
  bars: allTimeTotals(GUILD, 'benchpress').map((t) => ({
    name: t.displayName,
    colorSlot: t.colorSlot,
    value: t.points,
  })),
  unit: 'pts',
});
writeFileSync(join(outDir, '03b-bench.png'), bench);

const window14 = lastNDayKeys(14);
const trend = await renderTrend({
  title: 'Push-ups race',
  subtitle: 'Running total, last 14 days',
  dayKeys: window14,
  points: dailySeries(GUILD, window14[0]!, window14[window14.length - 1]!, 'pushups'),
  unit: 'reps',
});
writeFileSync(join(outDir, '04-trend.png'), trend);

const trend30 = lastNDayKeys(30);
const trendAll = await renderTrend({
  title: 'Points race',
  subtitle: 'Running total, last 30 days, all exercises',
  dayKeys: trend30,
  points: dailySeries(GUILD, trend30[0]!, trend30[trend30.length - 1]!),
  unit: 'pts',
});
writeFileSync(join(outDir, '05-trend30.png'), trendAll);

// Same window without the running total.
const trendDaily = await renderTrend({
  title: 'Points per day',
  subtitle: 'Last 14 days, all exercises',
  dayKeys: window14,
  points: dailySeries(GUILD, window14[0]!, window14[window14.length - 1]!),
  unit: 'pts',
  cumulative: false,
});
writeFileSync(join(outDir, '06-trend-daily.png'), trendDaily);

const alex = users[0]!;
const repKeys = exercises.filter((e) => e.unit === 'reps').map((e) => e.key);
const alexRows = allTimeTotals(GUILD).filter((r) => r.userId === alex.id);
const season = currentSeason();
const seasonRow = scoreboard(GUILD, season.startDay, today).find((r) => r.userId === alex.id);
const card = await renderPersonalCard({
  name: alex.displayName,
  colorSlot: alex.colorSlot,
  seasonPoints: seasonRow?.points ?? 0,
  seasonLabel: season.label,
  seasonNote: seasonRange(season),
  totalReps: alexRows.filter((r) => repKeys.includes(r.exerciseKey)).reduce((s, r) => s + r.total, 0),
  totalPoints: alexRows.reduce((s, r) => s + r.points, 0),
  daysLogged: daysLogged(GUILD, alex.id),
  streak: currentStreak(GUILD, alex.id, today),
  bestDay: bestDayForUser(GUILD, alex.id),
  perExercise: exercises.map((e) => {
    const row = alexRows.find((r) => r.exerciseKey === e.key);
    return { label: e.label, unit: e.unit, total: row?.total ?? 0, points: row?.points ?? 0 };
  }),
});
writeFileSync(join(outDir, '07-card.png'), card);

// Hall of fame rows are handed in directly: it needs finished seasons.
const hall = await renderHallOfFame({
  seasons: [
    {
      label: 'Season 2',
      range: 'Oct 1 – Nov 30',
      champions: [{ name: 'Casey', colorSlot: 3, points: 9240 }],
      runnerUp: { name: 'Jordan', points: 8610 },
      athletes: 9,
      frozen: true,
    },
    {
      label: 'Season 1',
      range: 'Jul 18 – Sep 30',
      champions: [
        { name: 'Alex', colorSlot: 0, points: 18822 },
        { name: 'Sam', colorSlot: 1, points: 18822 },
      ],
      runnerUp: { name: 'Jordan', points: 14993 },
      athletes: 12,
      frozen: true,
    },
  ],
});
writeFileSync(join(outDir, '08-hall-of-fame.png'), hall);

await closeBrowser();
console.log(`Rendered 9 charts to ${outDir}`);
