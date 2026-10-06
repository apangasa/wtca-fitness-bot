// Dry run of the season machinery against the live database: boundaries, the current season and the closing post.
// Future dates come from the rule, not stored rows (a stored row outranks the rule and would freeze a boundary).
import { config } from '../config.js';
import { firstEntryDay, getSeasonStandings, hasSeasonStandings, scoreboard } from '../db/queries.js';
import { closedSeasons, currentSeason, isClosed, listSeasons, seasonRange, seasonRuleFor } from '../seasons.js';
import { dayKeyFor } from '../time.js';

const guildId = config.guildId || process.argv[2] || '';
console.log(`db: ${config.dbPath}`);
console.log(`today (fitness day): ${dayKeyFor()}\n`);

console.log('--- boundaries -------------------------------------------------');
for (const s of [...listSeasons()].reverse()) {
  const mark = s.id === currentSeason().id ? '  <- in progress' : isClosed(s) ? '  (closed)' : '';
  console.log(`${s.label.padEnd(9)} ${s.startDay} .. ${s.endDay}${mark}`);
}

console.log('\n--- which season does a day belong to? -------------------------');
for (const day of [
  '2026-07-18',
  '2026-09-30',
  '2026-10-01',
  '2026-11-30',
  '2026-12-01',
  '2027-01-31',
  '2027-02-01',
  '2027-12-31',
]) {
  console.log(`${day} -> ${seasonRuleFor(day).label}`);
}

if (!guildId) {
  console.log('\nNo guild id (set DISCORD_GUILD_ID or pass it as an argument) - skipping standings.');
  process.exit(0);
}

console.log(`\n--- ${currentSeason().label} so far (${seasonRange(currentSeason())}) --------------`);
const season = currentSeason();
const live = scoreboard(guildId, season.startDay, dayKeyFor())
  .filter((r) => r.points > 0)
  .sort((a, b) => b.points - a.points);
console.table(
  live.map((r) => ({ name: r.displayName, points: Math.round(r.points), reps: r.reps, days: r.days })),
);
console.log(`first entry in the database: ${firstEntryDay(guildId) ?? 'none'}`);

console.log('\n--- what the closing post would say ---------------------------');
const pending = closedSeasons();
if (pending.length === 0) {
  const board = scoreboard(guildId, season.startDay, season.endDay)
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points);
  const top = board[0]?.points ?? 0;
  const champions = board.filter((r) => Math.abs(r.points - top) < 0.005);
  console.log(`Nothing has closed yet. When ${season.label} ends on ${season.endDay} it would post:`);
  console.log(`  ## ${season.label} is over — ${seasonRange(season)}`);
  console.log(
    champions.length === 0
      ? '  Nobody logged anything this season.'
      : `  Champion${champions.length > 1 ? `s (${champions.length})` : ''}: ` +
          `${champions.map((c) => c.displayName).join(' & ')} — ${Math.round(top).toLocaleString('en-US')} pts`,
  );
  console.log(`  Runner-up: ${board.find((r) => r.points < top)?.displayName ?? 'none'}`);
} else {
  for (const s of pending) {
    const frozen = hasSeasonStandings(s.id, guildId);
    const board = frozen ? getSeasonStandings(s.id, guildId) : scoreboard(guildId, s.startDay, s.endDay);
    const top = [...board].sort((a, b) => b.points - a.points)[0];
    console.log(
      `${s.label}: ${frozen ? 'frozen' : 'NOT yet frozen'}, leader ${top?.displayName ?? 'none'} ` +
        `(${Math.round(top?.points ?? 0).toLocaleString('en-US')} pts)`,
    );
  }
}
