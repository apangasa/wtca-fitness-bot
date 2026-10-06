// Interactive price table: type a body weight and the bodyweight prices update. Same arithmetic as src/scoring.ts (checked by npm run check).
import DATA from './price-data.js';

const implied = (ladder, novice, intermediate) => (ladder[1] / novice + ladder[2] / intermediate) / 2;

// A table row at a body weight: each column linear in body weight between the 10 lb rows, clamped to the table.
function rowAt(data, table, bodyLb) {
  const b = Math.min(Math.max(bodyLb, data.bwMin), data.bwMax);
  const f = (b - data.bwMin) / data.bwStep;
  const i = Math.min(Math.floor(f), table.novice.length - 2);
  const t = f - i;
  const mix = (col) => col[i] + (col[i + 1] - col[i]) * t;
  return { novice: mix(table.novice), intermediate: mix(table.intermediate) };
}

// Price per rep with no added load for one catalog exercise at a body weight.
export function priceAt(data, entry, bodyLb) {
  const table = data.tables[entry.table];
  const impliedAt = (lb) => {
    const row = rowAt(data, table, lb);
    return implied(data.ladder, row.novice, row.intermediate);
  };
  return entry.p * (impliedAt(bodyLb) / impliedAt(data.bwRef));
}

const fmt = (x) => x.toFixed(2);

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function mount(host) {
  const withCardio = host.dataset.rows === 'all';
  const saved = (() => {
    try {
      return Number(localStorage.getItem('wtca-bw'));
    } catch {
      return 0;
    }
  })();
  let bw = saved >= DATA.bwMin && saved <= DATA.bwMax ? saved : DATA.bwRef;

  const number = el('input', { type: 'number', min: DATA.bwMin, max: DATA.bwMax, step: 1, value: bw, ariaLabel: 'Body weight in lb' });
  const slider = el('input', { type: 'range', min: DATA.bwMin, max: DATA.bwMax, step: 1, value: bw, ariaLabel: 'Body weight slider' });
  const body = el('tbody');
  const table = el('table', {}, el('thead', {}, el('tr', {}, el('th', { textContent: 'Exercise' }), el('th', { textContent: 'Price per rep' }), el('th', { textContent: 'vs 150 lb' }))), body);
  host.className = 'price-widget';
  host.replaceChildren(
    el('label', {}, 'Your body weight (lb) ', number),
    slider,
    el('p', { className: 'price-widget-note', textContent: `Prices for ${DATA.bwMin}-${DATA.bwMax} lb. Without /weight set, the bot uses ${DATA.bwRef} lb.` }),
    table,
  );

  function render() {
    body.replaceChildren();
    for (const e of DATA.exercises) {
      const now = priceAt(DATA, e, bw);
      const change = (now / e.p - 1) * 100;
      const pct = Math.abs(change) < 0.05 ? '' : `${change > 0 ? '+' : ''}${change.toFixed(0)}%`;
      body.append(el('tr', {}, el('td', { textContent: e.label }), el('td', { textContent: fmt(now) }), el('td', { textContent: pct })));
    }
    if (withCardio) {
      body.append(
        el('tr', {}, el('td', { textContent: 'Run' }), el('td', { textContent: `${Math.round(DATA.cardio.run)} per mile` }), el('td')),
        el('tr', {}, el('td', { textContent: 'Swim' }), el('td', { textContent: `${Math.round(DATA.cardio.swim100)} per 100 yd` }), el('td')),
        el('tr', {}, el('td', { textContent: 'Flight of stairs, ankle alphabet' }), el('td', { textContent: '0 (tracked, no points)' }), el('td')),
      );
    }
  }

  function set(value) {
    if (!Number.isFinite(value)) return;
    bw = Math.min(Math.max(value, DATA.bwMin), DATA.bwMax);
    slider.value = bw;
    try {
      localStorage.setItem('wtca-bw', String(bw));
    } catch {
      // storage is optional
    }
    render();
  }
  number.addEventListener('input', () => {
    const v = Number(number.value);
    if (v >= DATA.bwMin && v <= DATA.bwMax) set(v);
  });
  number.addEventListener('change', () => {
    set(Number(number.value));
    number.value = bw;
  });
  slider.addEventListener('input', () => {
    number.value = slider.value;
    set(Number(slider.value));
  });
  render();

  // The page's static table stays as the no-script fallback; hide it once this one is up.
  const next = host.nextElementSibling;
  if (next && next.tagName === 'TABLE') next.hidden = true;
}

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent =
    '.price-widget{margin:1em 0}.price-widget input[type=number]{width:5em;font:inherit}.price-widget input[type=range]{display:block;width:100%;max-width:24em;margin:.5em 0}.price-widget-note{font-size:.9em;opacity:.8}';
  document.head.append(style);
  document.querySelectorAll('[data-price-widget]').forEach(mount);
}
