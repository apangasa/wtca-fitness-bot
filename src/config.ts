import 'dotenv/config';
import { join } from 'node:path';

// A setting that is present must be valid: a typo here would move the day boundary or the recap, so it stops the bot instead of falling back.
function intInRange(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name}=${raw} must be a whole number from ${min} to ${max}`);
  return n;
}

function clockTime(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(raw)) throw new Error(`${name}=${raw} must be a time like 04:05 (24-hour)`);
  return raw;
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
const cutoffHour = intInRange('DAY_CUTOFF_HOUR', 4, 0, 23);
const defaultRecapTime = `${String(cutoffHour).padStart(2, '0')}:05`;

export const config = {
  token: process.env.DISCORD_TOKEN ?? '',
  clientId: process.env.DISCORD_CLIENT_ID ?? '',
  guildId: process.env.DISCORD_GUILD_ID ?? '',
  recapChannelId: process.env.RECAP_CHANNEL_ID || null,
  tzName: process.env.TZ_NAME || 'America/New_York',
  cutoffHour,
  recapTime: clockTime('RECAP_TIME', defaultRecapTime),
  dbPath: process.env.DB_PATH || defaultDbPath(),
} as const;

/** The guild every script works on; an unset one would read and write under an empty id. */
export function requireGuildId(): string {
  if (!config.guildId) throw new Error('DISCORD_GUILD_ID is not set, so there is no guild to work on.');
  return config.guildId;
}

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
