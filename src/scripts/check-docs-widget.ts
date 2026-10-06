// The docs price widget must show exactly what the bot charges: its data file is current and its arithmetic matches scoring.ts.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildCurve, catalogPricing } from '../scoring.js';
import { buildDocsData, DATA_FILE, renderDocsData } from './build-docs-data.js';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' ' + detail}`);
}

const data = buildDocsData();
check('docs/assets/price-data.js is current (run npm run docs:data)', readFileSync(DATA_FILE, 'utf8') === renderDocsData(data));

const widgetUrl = pathToFileURL(DATA_FILE.replace('price-data.js', 'price-widget.js')).href;
const widget = (await import(widgetUrl)) as { priceAt: (d: unknown, e: unknown, bw: number) => number };

let worst = 0;
for (const entry of data.exercises) {
  const spec = catalogPricing(entry.key)!;
  for (const bw of [110, 117.5, 125, 140, 150, 163, 200, 230, 277.5, 310]) {
    const expected = buildCurve(spec, bw)(null);
    worst = Math.max(worst, Math.abs(widget.priceAt(data, entry, bw) - expected) / expected);
  }
}
check(`widget prices equal the scoring curves for every exercise and weight (worst relative gap ${worst.toExponential(1)})`, worst < 1e-9);

console.log(failures === 0 ? '\nAll docs widget checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures ? 1 : 0);
