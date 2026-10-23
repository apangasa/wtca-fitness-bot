// Fits expected height at a body weight (docs/points-height.md) on ANSUR II, the US Army's 2012 measured survey: ln(stature cm) on ln(mass kg),
// men only. Prints the two constants and the residual SD that src/anthropometry.ts holds, and 10 lb bin means beside the fit. Reads the public
// CSV (ANSUR II male and female in one file, from https://www.openlab.psu.edu/ansur2/, mirrored at the URL below); `tsx src/scripts/fit-ansur.ts`.
const SOURCE = 'https://calmcode.io/static/data/ergonomics.csv';
const LB_PER_KG = 2.20462;

const text = await (await fetch(SOURCE)).text();
const [header, ...lines] = text.trim().split(/\r?\n/);
const cols = header!.split(',');
const col = (name: string): number => {
  const i = cols.indexOf(name);
  if (i < 0) throw new Error(`fit-ansur: no column ${name}`);
  return i;
};
const [gender, stature, weight] = [col('gender'), col('stature'), col('weightkg')];
// stature is in mm; weightkg is in hectograms despite its name.
const men = lines
  .map((line) => line.split(','))
  .filter((r) => r[gender] === 'Male')
  .map((r) => ({ cm: Number(r[stature]) / 10, kg: Number(r[weight]) / 10 }));

const x = men.map((m) => Math.log(m.kg));
const y = men.map((m) => Math.log(m.cm));
const mean = (v: number[]): number => v.reduce((s, a) => s + a, 0) / v.length;
const [mx, my] = [mean(x), mean(y)];
let sxy = 0;
let sxx = 0;
for (let i = 0; i < men.length; i++) {
  sxy += (x[i]! - mx) * (y[i]! - my);
  sxx += (x[i]! - mx) ** 2;
}
const b = sxy / sxx;
const a = my - b * mx;
const resid = Math.sqrt(y.reduce((s, yi, i) => s + (yi - a - b * x[i]!) ** 2, 0) / (men.length - 2));

console.log(`n = ${men.length} men`);
console.log(`ln(height cm) = ${a.toFixed(4)} + ${b.toFixed(4)} x ln(mass kg); residual SD ${resid.toFixed(4)} (log units)`);
for (let lb = 110; lb <= 310; lb += 10) {
  const bin = men.filter((m) => Math.abs(m.kg * LB_PER_KG - lb) < 5).map((m) => m.cm);
  const fit = Math.exp(a + b * Math.log(lb / LB_PER_KG));
  console.log(`${lb} lb: fit ${fit.toFixed(1)} cm, bin mean ${bin.length ? mean(bin).toFixed(1) : '-'} cm (n ${bin.length})`);
}
