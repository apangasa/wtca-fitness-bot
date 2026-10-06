// Chart palette parameters; charts are flat PNGs, so every mark is direct-labeled.

export const SURFACE = '#1a1a19';
export const PLANE = '#0d0d0d';
export const INK_PRIMARY = '#ffffff';
export const INK_SECONDARY = '#c3c2b7';
export const INK_MUTED = '#898781';
export const GRIDLINE = '#2c2c2a';
export const BASELINE = '#383835';
export const GOOD = '#0ca30c';

// Series colours in join order, never cycled; separated for normal vision (the group has no colour-blind members).
export const SERIES = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
  '#75bad1', // soft cyan
  '#cde265', // lime
  '#d1a375', // tan
  '#d228d2', // orchid
  '#3ad93a', // bright green
  '#5b4fde', // indigo
] as const;

// Past the 15th person: separated by lightness.
export const NEUTRALS = ['#6f6e69', '#918f87', '#b3b1a7', '#d5d3c8'] as const;

/** Neutral colour for anything outside the series. */
export const OTHER = NEUTRALS[0];

export function seriesColor(slot: number): string {
  if (slot >= 0 && slot < SERIES.length) return SERIES[slot]!;
  return NEUTRALS[Math.max(0, slot - SERIES.length) % NEUTRALS.length]!;
}

export const BASE_CSS = /* css */ `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .viz-root {
    color-scheme: dark;
    --surface: ${SURFACE};
    --plane: ${PLANE};
    --ink: ${INK_PRIMARY};
    --ink-2: ${INK_SECONDARY};
    --ink-muted: ${INK_MUTED};
    --grid: ${GRIDLINE};
    --baseline: ${BASELINE};
    --ring: rgba(255, 255, 255, 0.10);

    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    background: var(--plane);
    color: var(--ink);
    padding: 28px;
    width: 100%;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--ring);
    border-radius: 16px;
    padding: 24px 26px;
  }

  .title {
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .subtitle {
    font-size: 13px;
    color: var(--ink-muted);
    margin-top: 3px;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 22px;
  }

  /* ---- KPI row: headline numbers get a stat tile, never a one-bar chart ---- */
  .kpis { display: flex; gap: 10px; margin-bottom: 22px; }

  .kpi {
    flex: 1;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--ring);
    border-radius: 12px;
    padding: 13px 15px;
  }

  .kpi-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .kpi-value { font-size: 27px; font-weight: 660; margin-top: 5px; letter-spacing: -0.02em; }
  .kpi-value small { font-size: 14px; font-weight: 550; color: var(--ink-2); margin-left: 2px; }
  .kpi-note { font-size: 11.5px; color: var(--ink-muted); margin-top: 3px; }

  /* ------------------------------- bar rows ------------------------------- */
  .panel-title {
    font-size: 13px;
    font-weight: 640;
    color: var(--ink-2);
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .panel-title span { font-size: 11.5px; color: var(--ink-muted); font-weight: 550; }

  .row { display: flex; align-items: center; gap: 10px; height: 26px; }
  .row + .row { margin-top: 4px; }

  .row-name {
    width: 78px;
    flex: none;
    font-size: 12.5px;
    color: var(--ink-2);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track { flex: 1; position: relative; height: 100%; display: flex; align-items: center; }

  /* 4px rounded data-end, square against the baseline it grows from */
  .bar { height: 15px; border-radius: 0 4px 4px 0; min-width: 3px; }

  .row-value {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    margin-left: 8px;
  }

  .empty { font-size: 12.5px; color: var(--ink-muted); font-style: italic; padding: 4px 0 4px 88px; }

  .foot {
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid var(--grid);
    font-size: 11.5px;
    color: var(--ink-muted);
    display: flex;
    justify-content: space-between;
  }

  /* -------------------------------- legend -------------------------------- */
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 16px; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-2); }
  .swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
`;
