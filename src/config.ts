import 'dotenv/config';
import { join } from 'node:path';

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(n) || n < min || n > max) return fallback;
  return n;
}

// Outside the repo: OneDrive can copy a SQLite file mid-write and corrupt it.
function defaultDbPath(): string {
  const base =
    process.env.LOCALAPPDATA ??
    process.env.XDG_DATA_HOME ??
    join(process.env.HOME ?? process.cwd(), '.local', 'share');
  return join(base, 'wtca-fitness-bot', 'fitness.db');
}

// The recap must fire at or after the cutoff, so it defaults to cutoff + 5 min.
const cutoffHour = intInRange(process.env.DAY_CUTOFF_HOUR, 4, 0, 23);
const defaultRecapTime = `${String(cutoffHour).padStart(2, '0')}:05`;

export const config = {
  token: process.env.DISCORD_TOKEN ?? '',
  clientId: process.env.DISCORD_CLIENT_ID ?? '',
  guildId: process.env.DISCORD_GUILD_ID ?? '',
  recapChannelId: process.env.RECAP_CHANNEL_ID || null,
  tzName: process.env.TZ_NAME || 'America/New_York',
  cutoffHour,
  recapTime: /^\d{1,2}:\d{2}$/.test(process.env.RECAP_TIME ?? '')
    ? (process.env.RECAP_TIME as string)
    : defaultRecapTime,
  dbPath: process.env.DB_PATH || defaultDbPath(),
} as const;

// Only the bot entrypoint needs credentials.
export function assertDiscordConfig(): void {
  const missing = (['token', 'clientId', 'guildId'] as const).filter((k) => !config[k]);
  if (missing.length > 0) {
    const names = missing
      .map((k) => ({ token: 'DISCORD_TOKEN', clientId: 'DISCORD_CLIENT_ID', guildId: 'DISCORD_GUILD_ID' })[k])
      .join(', ');
    throw new Error(`Missing ${names}. Copy .env.example to .env and fill it in.`);
  }
}

// A recap before the cutoff would summarise an open day and then be suppressed by change detection.
export function warnIfRecapTimeIsBeforeCutoff(): void {
  const hour = Number.parseInt(config.recapTime.split(':')[0] ?? '', 10);
  if (Number.isFinite(hour) && hour < config.cutoffHour) {
    console.warn(
      `[config] RECAP_TIME=${config.recapTime} is before DAY_CUTOFF_HOUR=${config.cutoffHour}:00. ` +
        `The recap summarises the day that just closed, so it must run at or after the cutoff. ` +
        `Recommended: ${String(config.cutoffHour).padStart(2, '0')}:05`,
    );
  }
}
