// Summary of the live database plus real-data chart renders to out/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { allTimeTotals, dailySeries, listUserWeights, userWeightLog } from '../db/queries.js';
import { renderLeaderboard, renderTrend } from '../render/charts.js';
import { SERIES } from '../render/theme.js';
import { closeBrowser } from '../render/browser.js';
import { lastNDayKeys } from '../time.js';

console.log(`db: ${config.dbPath}\n`);

const users = db().prepare('SELECT id, display_name, color_slot FROM users ORDER BY color_slot').all() as {
  id: string;
  display_name: string;
  color_slot: number;
}[];

const totals = db()
  .prepare(
    `SELECT u.display_name AS name, u.color_slot AS slot,
            COUNT(DISTINCT e.day_key) AS days,
            SUM(CASE WHEN x.unit = 'reps' THEN e.amount ELSE 0 END) AS reps,
            SUM(CASE WHEN x.unit = 'mi'   THEN e.amount ELSE 0 END) AS miles
     FROM entries e
     JOIN users u ON u.id = e.user_id
     JOIN exercises x ON x.key = e.exercise_key
     GROUP BY e.user_id ORDER BY reps DESC`,
  )
  .all();

const span = db()
  .prepare('SELECT MIN(day_key) AS a, MAX(day_key) AS b, COUNT(*) AS n FROM entries')
  .get() as { a: string; b: string; n: number };

console.log(`${span.n} entries, ${span.a} .. ${span.b}, ${users.length} people\n`);
console.table(totals);

// Body weights (/weight) and their change log, read-only.
const weights = listUserWeights();
console.log(`\nBody weights set (/weight): ${weights.length}`);
if (weights.length > 0) console.table(weights);
const weightLog = userWeightLog();
if (weightLog.length > 0) {
  console.log('Weight change log (append-only):');
  console.table(weightLog);
}

const overflow = users.filter((u) => u.color_slot >= SERIES.length);
console.log(
  overflow.length > 0
    ? `\n${overflow.length} past the ${SERIES.length} colour slots -> neutral: ${overflow.map((u) => u.display_name).join(", ")}`
    : `\nAll ${users.length} people fit inside the ${SERIES.length} colour slots.`,
);

const outDir = join(process.cwd(), 'out');
mkdirSync(outDir, { recursive: true });

const perUser = new Map<string, { name: string; colorSlot: number; value: number }>();
for (const t of allTimeTotals(config.guildId)) {
  if (t.points === 0) continue;
  const cur = perUser.get(t.userId) ?? { name: t.displayName, colorSlot: t.colorSlot, value: 0 };
  cur.value += t.points;
  perUser.set(t.userId, cur);
}

writeFileSync(
  join(outDir, 'real-01-leaderboard.png'),
  await renderLeaderboard({
    title: 'Points leaderboard',
    subtitle: 'All time — points across every exercise',
    bars: [...perUser.values()],
    unit: 'pts',
    footNote: `${span.a} to ${span.b}`,
  }),
);

const window = lastNDayKeys(30);
writeFileSync(
  join(outDir, 'real-02-race.png'),
  await renderTrend({
    title: 'Points race',
    subtitle: 'Running total, last 30 days',
    dayKeys: window,
    points: dailySeries(config.guildId, window[0]!, window[window.length - 1]!),
    unit: 'pts',
  }),
);

await closeBrowser();
console.log('\nwrote out/real-01-leaderboard.png and out/real-02-race.png');
