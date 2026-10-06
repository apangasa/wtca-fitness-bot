import { DateTime } from 'luxon';
import { config } from './config.js';

// A fitness day runs cutoff hour to cutoff hour: shift the clock back by the cutoff, then take the calendar date.
export function dayKeyFor(when: Date = new Date(), tz = config.tzName, cutoffHour = config.cutoffHour): string {
  const local = DateTime.fromJSDate(when, { zone: tz }).minus({ hours: cutoffHour });
  return local.toISODate() ?? DateTime.now().toISODate()!;
}

/** Inclusive list of day keys ending at `endKey`, oldest first. */
export function lastNDayKeys(n: number, endKey = dayKeyFor()): string[] {
  const end = DateTime.fromISO(endKey);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(end.minus({ days: i }).toISODate()!);
  return keys;
}

/** Inclusive day keys from `fromKey` to `toKey`, oldest first. */
export function dayKeysBetween(fromKey: string, toKey: string): string[] {
  const end = DateTime.fromISO(toKey);
  const keys: string[] = [];
  for (let cur = DateTime.fromISO(fromKey); cur <= end; cur = cur.plus({ days: 1 })) {
    keys.push(cur.toISODate()!);
  }
  return keys.length > 0 ? keys : [toKey];
}

export function previousDayKey(key: string): string {
  return DateTime.fromISO(key).minus({ days: 1 }).toISODate()!;
}

/** "Tue Aug 11" */
export function formatDayKey(key: string): string {
  return DateTime.fromISO(key).toFormat('ccc LLL d');
}

/** "Jul 18" */
export function formatMonthDay(key: string): string {
  return DateTime.fromISO(key).toFormat('LLL d');
}

/** "8/11/2026" */
export function formatDayKeyShort(key: string): string {
  return DateTime.fromISO(key).toFormat('L/d/yyyy');
}

/** Milliseconds from now until the next occurrence of HH:MM in the configured zone. */
export function msUntilNext(hhmm: string, tz = config.tzName): number {
  const [h, m] = hhmm.split(':').map((s) => Number.parseInt(s, 10));
  const now = DateTime.now().setZone(tz);
  let target = now.set({ hour: h ?? 23, minute: m ?? 0, second: 0, millisecond: 0 });
  if (target <= now) target = target.plus({ days: 1 });
  return target.diff(now).toMillis();
}
