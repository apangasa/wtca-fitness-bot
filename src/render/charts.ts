import { formatAmount, samePoints, unitSuffix, type Metric, type Unit } from '../exercises.js';
import type { DailyPoint, DetailRow, ExerciseRow, TotalRow } from '../db/queries.js';
import { formatDayKey } from '../time.js';
import { renderToPng } from './browser.js';
import { BASELINE, GRIDLINE, INK_MUTED, INK_SECONDARY, SERIES, seriesColor } from './theme.js';

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const num = (n: number): string => Math.round(n).toLocaleString('en-US');

interface Bar {
  name: string;
  colorSlot: number;
  value: number;
}

// Horizontal bars; each carries its name and value as text.
function barRows(bars: Bar[], unit: Metric, scaleMax?: number): string {
  if (bars.length === 0) return '<div class="empty">nothing logged</div>';
  const max = scaleMax ?? Math.max(...bars.map((b) => b.value), 1);

  return bars
    .map((b) => {
      const pct = Math.max((b.value / max) * 100, 1.5);
      return `<div class="row">
        <div class="row-name">${esc(b.name)}</div>
        <div class="track">
          <div class="bar" style="width:${pct.toFixed(2)}%;background:${seriesColor(b.colorSlot)}"></div>
          <div class="row-value">${esc(formatAmount(b.value, unit))}</div>
        </div>
      </div>`;
    })
    .join('');
}

function kpi(label: string, value: string, unit?: string, note?: string): string {
  return `<div class="kpi">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    ${note ? `<div class="kpi-note">${esc(note)}</div>` : ''}
  </div>`;
}

function legend(entries: { name: string; colorSlot: number }[]): string {
  if (entries.length < 2) return '';
  return `<div class="legend">${entries
    .map(
      (e) =>
        `<div class="legend-item"><div class="swatch" style="background:${seriesColor(e.colorSlot)}"></div>${esc(
          e.name,
        )}</div>`,
    )
    .join('')}</div>`;
}

export interface DailyCardInput {
  dayKey: string;
  exercises: ExerciseRow[];
  totals: TotalRow[];
  // Per-weight breakdown ("8 @ 115, 16 @ 135 lb").
  details: DetailRow[];
  guildLabel: string;
}

const weightText = (lb: number): string => String(Math.round(lb * 10) / 10);

// "Bench Press 24 @ 135 lb": one person's work on one exercise.
function exerciseSummary(ex: ExerciseRow, rows: DetailRow[]): string {
  const plain = rows.filter((r) => !r.weight || r.weight <= 0).reduce((sum, r) => sum + r.amount, 0);
  const loaded = rows.filter((r) => r.weight && r.weight > 0).sort((a, b) => a.weight! - b.weight!);
  const parts: string[] = [];
  if (plain > 0) parts.push(formatAmount(plain, ex.unit));
  for (const r of loaded) parts.push(`${formatAmount(r.amount, ex.unit)} @ ${weightText(r.weight!)}`);
  return `${ex.label} ${parts.join(', ')}${loaded.length > 0 ? ' lb' : ''}`;
}

const SUMMARY_ITEMS = 6;

// One row per person ranked by points with a line saying what they did; height grows with people, not exercises.
export async function renderDailyCard(input: DailyCardInput): Promise<Buffer> {
  const { dayKey, exercises, totals, details, guildLabel } = input;
  const exByKey = new Map(exercises.map((e) => [e.key, e]));

  interface Person {
    name: string;
    colorSlot: number;
    reps: number;
    points: number;
    items: { text: string; points: number; order: number }[];
  }
  const people = new Map<string, Person>();
  for (const t of totals) {
    const p = people.get(t.userId) ?? { name: t.displayName, colorSlot: t.colorSlot, reps: 0, points: 0, items: [] };
    if (exByKey.get(t.exerciseKey)?.unit === 'reps') p.reps += t.total;
    p.points += t.points;
    people.set(t.userId, p);
  }

  const grouped = new Map<string, Map<string, DetailRow[]>>();
  for (const d of details) {
    const perEx = grouped.get(d.userId) ?? new Map<string, DetailRow[]>();
    perEx.set(d.exerciseKey, [...(perEx.get(d.exerciseKey) ?? []), d]);
    grouped.set(d.userId, perEx);
  }
  for (const [userId, perEx] of grouped) {
    const person = people.get(userId);
    if (!person) continue;
    for (const [exKey, rows] of perEx) {
      const ex = exByKey.get(exKey);
      if (!ex) continue;
      person.items.push({
        text: exerciseSummary(ex, rows),
        points: rows.reduce((sum, r) => sum + r.points, 0),
        order: ex.sortOrder,
      });
    }
    person.items.sort((a, b) => b.points - a.points || a.order - b.order);
  }

  const ranked = [...people.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const repsTotal = ranked.reduce((sum, p) => sum + p.reps, 0);
  const pointsTotal = ranked.reduce((sum, p) => sum + p.points, 0);
  // A tie has no single winner: show every leader.
  const topPoints = ranked[0]?.points ?? 0;
  const leaders = ranked.filter((p) => p.points > 0 && samePoints(p.points, topPoints));
  const leaderLabel =
    leaders.length === 1 ? 'Most points' : leaders.length === 2 ? 'Tied for most' : `${leaders.length}-way tie`;
  const leaderNames = leaders.length <= 2 ? leaders.map((l) => l.name).join(' & ') : `${leaders.length} people`;

  const rows = ranked
    .map((p) => {
      const shown = p.items.slice(0, SUMMARY_ITEMS).map((i) => esc(i.text));
      const more = p.items.length - shown.length;
      const summary = shown.join(' · ') + (more > 0 ? ` · +${more} more` : '');
      return `<div class="person">
        ${barRows([{ name: p.name, colorSlot: p.colorSlot, value: p.points }], 'pts', Math.max(topPoints, 1))}
        <div class="sub">${summary}</div>
      </div>`;
    })
    .join('');

  const body = `
    <style>
      .row { height: 30px; }
      .row-name { width: 110px; font-size: 13.5px; color: var(--ink); font-weight: 600; }
      .bar { height: 18px; }
      .person { margin-bottom: 12px; }
      .sub { margin: 1px 0 0 120px; font-size: 11.5px; line-height: 1.4; color: var(--ink-muted); }
    </style>
    <div class="card">
      <div class="head">
        <div>
          <div class="title">${esc(guildLabel)} Fitness</div>
          <div class="subtitle">${esc(formatDayKey(dayKey))}</div>
        </div>
      </div>
      <div class="kpis">
        ${kpi('Total points', num(pointsTotal))}
        ${kpi('Total reps', num(repsTotal))}
        ${kpi('Logged in', String(people.size), people.size === 1 ? 'person' : 'people')}
        ${leaders.length > 0 ? kpi(leaderLabel, leaderNames, undefined, `${num(topPoints)} pts`) : ''}
      </div>
      ${ranked.length > 0 ? rows : '<div class="empty">No one logged anything today.</div>'}
      <div class="foot"><div>Weighted lifts score by the weight on the bar. Colors stay with each person.</div><div>${esc(
        formatDayKey(dayKey),
      )}</div></div>
    </div>`;

  return renderToPng(body, 820);
}

export interface LeaderboardInput {
  title: string;
  subtitle: string;
  bars: Bar[];
  unit: Metric;
  footNote?: string;
}

export async function renderLeaderboard(input: LeaderboardInput): Promise<Buffer> {
  const { title, subtitle, bars, unit, footNote } = input;
  const sorted = [...bars].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, b) => s + b.value, 0);
  // Same tie rule as the daily card.
  const topValue = sorted[0]?.value ?? 0;
  const leaders = sorted.filter((b) => b.value > 0 && samePoints(b.value, topValue));
  const leaderLabel = leaders.length === 1 ? 'Leader' : `Tied (${leaders.length})`;
  const leaderNames = leaders.length <= 2 ? leaders.map((l) => l.name).join(' & ') : `${leaders.length} people`;

  const body = `
    <style>
      .row { height: 32px; }
      .row-name { width: 110px; font-size: 13.5px; }
      .bar { height: 19px; }
      .row-value { font-size: 13.5px; }
    </style>
    <div class="card">
      <div class="head">
        <div>
          <div class="title">${esc(title)}</div>
          <div class="subtitle">${esc(subtitle)}</div>
        </div>
      </div>
      <div class="kpis">
        ${kpi('Combined', formatAmount(total, unit))}
        ${leaders.length > 0 ? kpi(leaderLabel, leaderNames, undefined, formatAmount(topValue, unit)) : ''}
        ${kpi('Athletes', String(sorted.length))}
      </div>
      ${barRows(sorted, unit)}
      ${footNote ? `<div class="foot"><div>${esc(footNote)}</div><div></div></div>` : ''}
    </div>`;

  return renderToPng(body, 760);
}

export interface TrendInput {
  title: string;
  subtitle: string;
  dayKeys: string[];
  points: DailyPoint[];
  unit: Metric;
  // Cumulative by default (running totals only rise); false shows the raw daily shape.
  cumulative?: boolean;
}

/** Multi-line trend. Series are direct-labeled at their right end plus a legend. */
export async function renderTrend(input: TrendInput): Promise<Buffer> {
  const { title, subtitle, dayKeys, points, unit } = input;
  const cumulative = input.cumulative ?? true;

  const byUser = new Map<string, { name: string; colorSlot: number; values: number[] }>();
  const idx = new Map(dayKeys.map((k, i) => [k, i]));
  for (const p of points) {
    const i = idx.get(p.dayKey);
    if (i === undefined) continue;
    const s =
      byUser.get(p.userId) ?? { name: p.displayName, colorSlot: p.colorSlot, values: dayKeys.map(() => 0) };
    s.values[i] = (s.values[i] ?? 0) + p.total;
    byUser.set(p.userId, s);
  }

  // Series ceiling is the palette size; past it the lowest-volume people are left off (/leaderboard shows everyone).
  const series = [...byUser.values()]
    .sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0))
    .slice(0, SERIES.length);

  if (cumulative) {
    for (const s of series) {
      let running = 0;
      s.values = s.values.map((v) => (running += v));
    }
  }

  const W = 860;
  const H = 300;
  const M = { top: 16, right: 96, bottom: 34, left: 46 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(maxValue);
  const yMax = ticks[ticks.length - 1]!;

  const x = (i: number): number =>
    M.left + (dayKeys.length <= 1 ? plotW / 2 : (i / (dayKeys.length - 1)) * plotW);
  const y = (v: number): number => M.top + plotH - (v / yMax) * plotH;

  const grid = ticks
    .map(
      (t) =>
        `<line x1="${M.left}" y1="${y(t).toFixed(1)}" x2="${M.left + plotW}" y2="${y(t).toFixed(1)}"
           stroke="${t === 0 ? BASELINE : GRIDLINE}" stroke-width="1"/>
         <text x="${M.left - 9}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end"
           font-size="11" fill="${INK_MUTED}" font-family="system-ui,sans-serif">${num(t)}</text>`,
    )
    .join('');

  const showMarkers = dayKeys.length <= 14;
  const lines = series
    .map((s) => {
      const color = seriesColor(s.colorSlot);
      const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const markers = showMarkers
        ? s.values
            .map(
              (v, i) =>
                `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${color}"
                   stroke="#1a1a19" stroke-width="2"/>`,
            )
            .join('')
        : '';
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"/>${markers}`;
    })
    .join('');

  // Nudge end labels apart so overlapping series stay readable.
  const labels = deCollide(
    series.map((s) => ({
      text: s.name,
      color: seriesColor(s.colorSlot),
      yPos: y(s.values[s.values.length - 1] ?? 0),
    })),
    14,
    M.top,
    M.top + plotH,
  )
    .map(
      (l) =>
        `<text x="${M.left + plotW + 10}" y="${(l.yPos + 4).toFixed(1)}" font-size="12" font-weight="600"
           fill="${l.color}" font-family="system-ui,sans-serif">${esc(l.text)}</text>`,
    )
    .join('');

  const step = Math.max(1, Math.ceil(dayKeys.length / 7));
  const xLabels = dayKeys
    .map((k, i) =>
      i % step === 0 || i === dayKeys.length - 1
        ? `<text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11"
             fill="${INK_MUTED}" font-family="system-ui,sans-serif">${esc(formatDayKey(k).replace(/^\w+ /, ''))}</text>`
        : '',
    )
    .join('');

  const body = `
    <div class="card">
      <div class="head">
        <div>
          <div class="title">${esc(title)}</div>
          <div class="subtitle">${esc(subtitle)}</div>
        </div>
        <div style="font-size:12px;color:${INK_SECONDARY}">${esc(
          cumulative ? `cumulative ${unitSuffix(unit)}` : `${unitSuffix(unit)} per day`,
        )}</div>
      </div>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        ${grid}${lines}${labels}${xLabels}
      </svg>
      ${legend(series.map((s) => ({ name: s.name, colorSlot: s.colorSlot })))}
    </div>`;

  return renderToPng(body, W + 56);
}

export interface PersonalCardInput {
  name: string;
  colorSlot: number;
  totalReps: number;
  totalPoints: number;
  seasonPoints: number;
  // "Season 1": the tile's own label.
  seasonLabel: string;
  // "Jul 18 – Sep 30"
  seasonNote: string;
  daysLogged: number;
  streak: number;
  bestDay: { dayKey: string; total: number } | null;
  perExercise: { label: string; unit: Unit; total: number; points: number }[];
}

// A single person's card: one hue, since only one entity is on screen.
export async function renderPersonalCard(input: PersonalCardInput): Promise<Buffer> {
  const { name, colorSlot, totalReps, totalPoints, seasonPoints, seasonLabel, seasonNote, daysLogged, streak, bestDay, perExercise } =
    input;
  const withData = perExercise.filter((e) => e.total > 0);

  // Points by exercise are comparable across exercises; distance and time keep their own unit-grouped scales.
  const scored = withData.filter((e) => e.points > 0).sort((a, b) => b.points - a.points);
  const TOP = 10;
  const shown = scored.slice(0, TOP);
  const rest = scored.slice(TOP);
  const maxPoints = Math.max(...scored.map((e) => e.points), 1);

  const barRow = (label: string, pct: number, value: string): string => `<div class="row">
      <div class="row-name">${esc(label)}</div>
      <div class="track">
        <div class="bar" style="width:${Math.max(pct, 1.5).toFixed(2)}%;background:${seriesColor(colorSlot)}"></div>
        <div class="row-value">${esc(value)}</div>
      </div>
    </div>`;

  const unscored = withData.filter((e) => e.points <= 0);
  const groups = new Map<Unit, typeof unscored>();
  for (const e of unscored) groups.set(e.unit, [...(groups.get(e.unit) ?? []), e]);

  const GROUP_LABELS: Record<Unit, string> = {
    reps: 'Reps',
    mi: 'Distance',
    km: 'Distance',
    yd: 'Distance',
    m: 'Distance',
    min: 'Time',
  };

  const scoredRows = shown
    .map((e) =>
      barRow(
        e.label,
        (e.points / maxPoints) * 100,
        `${num(e.points)} pts · ${formatAmount(e.total, e.unit)}${e.unit === 'reps' ? ' reps' : ''}`,
      ),
    )
    .join('');
  const foldedRow =
    rest.length > 0
      ? `<div class="folded">+ ${rest.length} more exercise${rest.length === 1 ? '' : 's'} · ${num(
          rest.reduce((sum, e) => sum + e.points, 0),
        )} pts</div>`
      : '';

  const otherRows = [...groups.entries()]
    .map(([unit, items]) => {
      const max = Math.max(...items.map((i) => i.total), 1);
      return (
        `<div class="group-label">${esc(GROUP_LABELS[unit])}</div>` +
        items.map((e) => barRow(e.label, (e.total / max) * 100, formatAmount(e.total, e.unit))).join('')
      );
    })
    .join('');

  const rows =
    (scored.length > 0 ? `<div class="group-label">Points by exercise</div>${scoredRows}${foldedRow}` : '') + otherRows;

  const body = `
    <style>
      .kpis { flex-wrap: wrap; }
      .kpi { min-width: 128px; }
      .kpi-value { font-size: 23px; }
      .row { height: 30px; }
      .row-name { width: 132px; font-size: 13px; }
      .bar { height: 17px; }
      .folded { margin: 6px 0 0 142px; font-size: 12px; color: var(--ink-muted); }
      .group-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--ink-muted);
        font-weight: 600;
        margin: 16px 0 8px 142px;
      }
      .group-label:first-child { margin-top: 0; }
    </style>
    <div class="card">
      <div class="head">
        <div>
          <div class="title">${esc(name)}</div>
          <div class="subtitle">Season standing and career log</div>
        </div>
      </div>
      <div class="kpis">
        ${kpi(`${seasonLabel} points`, num(seasonPoints), undefined, seasonNote)}
        ${kpi('Career points', num(totalPoints))}
        ${kpi('Career reps', num(totalReps))}
        ${kpi('Days logged', String(daysLogged))}
        ${kpi('Streak', String(streak), streak === 1 ? 'day' : 'days')}
        ${bestDay ? kpi('Best day', num(bestDay.total), 'pts', formatDayKey(bestDay.dayKey)) : ''}
      </div>
      ${rows || '<div class="empty">nothing logged yet</div>'}
    </div>`;

  return renderToPng(body, 980);
}

export interface HallOfFameSeason {
  label: string;
  range: string;
  champions: { name: string; colorSlot: number; points: number }[];
  runnerUp: { name: string; points: number } | null;
  athletes: number;
  frozen: boolean;
}

export interface HallOfFameInput {
  seasons: HallOfFameSeason[];
}

// Past champions, newest first, as text: totals across seasons are not comparable.
export async function renderHallOfFame(input: HallOfFameInput): Promise<Buffer> {
  const rows = input.seasons
    .map((s) => {
      const names = s.champions.map((c) => esc(c.name)).join(' & ');
      const swatches = s.champions
        .map((c) => `<span class="dot" style="background:${seriesColor(c.colorSlot)}"></span>`)
        .join('');
      const crown = s.champions.length > 1 ? `Co-champions (${s.champions.length})` : 'Champion';
      const points = s.champions[0]?.points ?? 0;
      return `<div class="season">
        <div class="season-head">
          <div class="season-label">${esc(s.label)}</div>
          <div class="season-range">${esc(s.range)}</div>
        </div>
        <div class="champ">
          <div class="crown">${esc(crown)}</div>
          <div class="champ-name">${swatches}${names || '<span class="none">no one scored</span>'}</div>
          <div class="champ-points">${esc(num(points))} pts</div>
        </div>
        <div class="season-foot">
          ${s.runnerUp ? `Runner-up ${esc(s.runnerUp.name)} — ${esc(num(s.runnerUp.points))} pts` : 'No runner-up'}
          <span>${s.athletes} logged in${s.frozen ? '' : ' · not yet frozen'}</span>
        </div>
      </div>`;
    })
    .join('');

  const body = `
    <style>
      .season { padding: 16px 0; border-top: 1px solid var(--grid); }
      .season:first-of-type { border-top: none; padding-top: 0; }
      .season-head { display: flex; align-items: baseline; gap: 10px; }
      .season-label { font-size: 15px; font-weight: 650; }
      .season-range { font-size: 12px; color: var(--ink-muted); }
      .champ { display: flex; align-items: baseline; gap: 12px; margin-top: 10px; }
      .crown {
        font-size: 10.5px;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--ink-muted);
        font-weight: 600;
        width: 124px;
        flex: none;
      }
      .champ-name { font-size: 26px; font-weight: 660; letter-spacing: -0.02em; flex: 1; }
      .champ-points { font-size: 15px; font-weight: 620; font-variant-numeric: tabular-nums; color: var(--ink-2); }
      .dot { display: inline-block; width: 11px; height: 11px; border-radius: 4px; margin-right: 8px; }
      .none { font-size: 15px; font-weight: 500; color: var(--ink-muted); font-style: italic; }
      .season-foot {
        display: flex;
        justify-content: space-between;
        font-size: 11.5px;
        color: var(--ink-muted);
        margin-top: 8px;
        margin-left: 136px;
      }
    </style>
    <div class="card">
      <div class="head">
        <div>
          <div class="title">Hall of fame</div>
          <div class="subtitle">Every finished season</div>
        </div>
      </div>
      ${rows || '<div class="empty">no finished seasons yet</div>'}
    </div>`;

  return renderToPng(body, 720);
}

// Ticks whose top always covers max; aims at five intervals.
function niceTicks(max: number): number[] {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const top = Math.max(Math.ceil(max / step) * step, step);

  const out: number[] = [];
  for (let v = 0; v <= top + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  return out.length >= 2 ? out : [0, step];
}

/** Pushes overlapping labels apart, keeping them inside the plot band. */
function deCollide<T extends { yPos: number }>(items: T[], minGap: number, lo: number, hi: number): T[] {
  const sorted = [...items].sort((a, b) => a.yPos - b.yPos);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.yPos - prev.yPos < minGap) cur.yPos = prev.yPos + minGap;
  }
  const overflow = (sorted[sorted.length - 1]?.yPos ?? 0) - hi;
  if (overflow > 0) for (const s of sorted) s.yPos = Math.max(lo, s.yPos - overflow);
  return sorted;
}
