import { AttachmentBuilder, ChannelType, type Client } from 'discord.js';
import { DateTime } from 'luxon';
import { config } from './config.js';
import { formatAmount, samePoints } from './exercises.js';
import { createHash } from 'node:crypto';
import {
  dayDetails,
  dayTotals,
  getGuildConfig,
  getSeasonStandings,
  hasSeasonStandings,
  listExercises,
  saveSeasonStandings,
  scoreboard,
  setGuildConfig,
  type DetailRow,
  type StandingRow,
  type TotalRow,
} from './db/queries.js';
import { renderDailyCard, renderLeaderboard } from './render/charts.js';
import { closedSeasons, seasonForDay, seasonRange } from './seasons.js';
import { dayKeyFor, formatDayKeyShort, msUntilNext, previousDayKey } from './time.js';

export interface RecapMessage {
  content: string;
  files: AttachmentBuilder[];
}

export async function buildRecapMessage(
  guildId: string,
  guildLabel: string,
  dayKey = dayKeyFor(),
): Promise<RecapMessage | null> {
  const totals = dayTotals(guildId, dayKey);
  if (totals.length === 0) return null;

  const image = await renderDailyCard({
    dayKey,
    exercises: listExercises(),
    totals,
    details: dayDetails(guildId, dayKey),
    guildLabel,
  });
  const lines = [`## ${formatDayKeyShort(dayKey)} ${guildLabel} Fitness`];
  const season = seasonForDay(dayKey);
  const ranked = scoreboard(guildId, season.startDay, dayKey)
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points);
  const top = ranked[0]?.points ?? 0;
  const leaders = ranked.filter((r) => samePoints(r.points, top));
  if (leaders.length > 0) {
    lines.push(
      '',
      `**${season.label} ${leaders.length > 1 ? 'leaders' : 'leader'}:** ` +
        `${leaders.map((l) => l.displayName).join(' & ')} — ${formatAmount(top, 'pts')} pts`,
    );
  }

  return { content: lines.join('\n'), files: [new AttachmentBuilder(image, { name: `recap-${dayKey}.png` })] };
}

export type RecapStatus = 'posted' | 'unchanged' | 'empty' | 'no-channel';
export interface RecapOutcome {
  status: RecapStatus;
  dayKey: string;
}

// Fingerprint of a day's totals; the recap re-posts only when it changes.
function totalsSignature(totals: TotalRow[], details: DetailRow[]): string {
  const canonical = totals
    .map((t) => `${t.userId}:${t.exerciseKey}:${t.total}`)
    .sort()
    .join('|');
  // Loaded sets are part of the fingerprint: a different weight changes points but not reps.
  const loaded = details
    .filter((d) => d.weight && d.weight > 0)
    .map((d) => `${d.userId}:${d.exerciseKey}:${d.weight}:${d.amount}`)
    .sort()
    .join('|');
  return createHash('sha256')
    .update(loaded ? `${canonical}#${loaded}` : canonical)
    .digest('hex')
    .slice(0, 16);
}

// The one path the scheduler and /recap share, so change detection cannot be bypassed.
export async function maybePostRecap(client: Client, guildId: string, dayKey: string): Promise<RecapOutcome> {
  const guildCfg = getGuildConfig(guildId);
  const channelId = guildCfg.recapChannelId ?? config.recapChannelId;
  if (!channelId) {
    console.warn('[recap] no channel configured; set RECAP_CHANNEL_ID or recap_channel_id in the database');
    return { status: 'no-channel', dayKey };
  }

  const totals = dayTotals(guildId, dayKey);
  if (totals.length === 0) return { status: 'empty', dayKey };

  const signature = totalsSignature(totals, dayDetails(guildId, dayKey));
  if (guildCfg.lastRecapDay === dayKey && guildCfg.lastRecapSig === signature) {
    return { status: 'unchanged', dayKey };
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    console.warn(`[recap] channel ${channelId} is not a text channel I can post in`);
    return { status: 'no-channel', dayKey };
  }

  const message = await buildRecapMessage(guildId, guild?.name ?? 'WTCA', dayKey);
  if (!message) return { status: 'empty', dayKey };

  await channel.send(message);
  setGuildConfig(guildId, { lastRecapDay: dayKey, lastRecapSig: signature });
  return { status: 'posted', dayKey };
}

export type SeasonCloseStatus = 'posted' | 'nothing' | 'no-channel';
export interface SeasonCloseOutcome {
  status: SeasonCloseStatus;
  announced: number[];
}

// Posts and freezes any finished season not yet announced; driven by a marker so a bot that was down at the rollover catches up.
export async function maybeAnnounceClosedSeasons(
  client: Client,
  guildId: string,
  // Overridable to rehearse the rollover on a database copy.
  todayKey = dayKeyFor(),
): Promise<SeasonCloseOutcome> {
  const cfg = getGuildConfig(guildId);
  const pending = closedSeasons(todayKey)
    .filter((s) => s.id > (cfg.lastClosedSeason ?? 0))
    .sort((a, b) => a.id - b.id);
  if (pending.length === 0) return { status: 'nothing', announced: [] };

  const channelId = cfg.recapChannelId ?? config.recapChannelId;
  if (!channelId) return { status: 'no-channel', announced: [] };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    console.warn(`[season] channel ${channelId} is not a text channel I can post in`);
    return { status: 'no-channel', announced: [] };
  }

  const announced: number[] = [];
  for (const season of pending) {
    const live = scoreboard(guildId, season.startDay, season.endDay);
    if (live.length > 0 && !hasSeasonStandings(season.id, guildId)) {
      saveSeasonStandings(season.id, guildId, live);
    }
    // Read back: a season frozen on an earlier attempt keeps those numbers.
    const frozen = getSeasonStandings(season.id, guildId);
    const board: StandingRow[] = frozen.length > 0 ? frozen : live;

    const next = seasonForDay(DateTime.fromISO(season.endDay).plus({ days: 1 }).toISODate()!);
    const ranked = board.filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
    const top = ranked[0]?.points ?? 0;
    const champions = ranked.filter((r) => samePoints(r.points, top));

    const lines = [`## ${season.label} is over — ${seasonRange(season)}`];
    if (champions.length === 0) {
      lines.push('Nobody logged anything this season.');
    } else {
      const word = champions.length > 1 ? `Co-champions (${champions.length})` : 'Champion';
      lines.push(
        `**${word}: ${champions.map((c) => c.displayName).join(' & ')}** — ${Math.round(top).toLocaleString('en-US')} pts`,
      );
    }
    lines.push(
      `**${next.label}** starts now (${seasonRange(next)}) — everyone back to 0. ` +
        `Past seasons stay in \`/seasons\` and \`/leaderboard\`.`,
    );

    const files =
      ranked.length > 0
        ? [
            new AttachmentBuilder(
              await renderLeaderboard({
                title: `${season.label} final standings`,
                subtitle: `${seasonRange(season)} — points across every exercise`,
                bars: ranked.map((r) => ({ name: r.displayName, colorSlot: r.colorSlot, value: r.points })),
                unit: 'pts',
                footNote: 'Frozen — a later points change will not rewrite this board',
              }),
              { name: `season-${season.id}-final.png` },
            ),
          ]
        : [];

    await channel.send({ content: lines.join('\n'), files });
    // Marked one at a time so a failure does not skip seasons never posted.
    setGuildConfig(guildId, { lastClosedSeason: season.id });
    announced.push(season.id);
  }

  return { status: 'posted', announced };
}

export function startRecapScheduler(client: Client, guildId: string): void {
  const schedule = (): void => {
    const time = getGuildConfig(guildId).recapTime ?? config.recapTime;
    const delay = msUntilNext(time);
    console.log(`[recap] next run in ${Math.round(delay / 60000)} min (${time} ${config.tzName})`);

    setTimeout(() => {
      void (async () => {
        try {
          // Recap the day that has already closed: dayKeyFor() is already the new day at the fire time.
          const dayKey = previousDayKey(dayKeyFor());
          const outcome = await maybePostRecap(client, guildId, dayKey);
          console.log(`[recap] ${dayKey}: ${outcome.status}`);

          // After the day's detail so the season closing reads as the last note.
          const close = await maybeAnnounceClosedSeasons(client, guildId);
          if (close.announced.length > 0) console.log(`[season] closed ${close.announced.join(', ')}`);
        } catch (err) {
          console.error('[recap] failed:', err);
        } finally {
          schedule();
        }
      })();
    }, delay);
  };

  schedule();
}
