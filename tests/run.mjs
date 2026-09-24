// Runs the page's own <script> against tests/fixtures with a stubbed DOM, and checks
// which countries it finds. No browser and no dependencies: `node tests/run.mjs` (Node 20+).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('</script>'));

// Anything the page touches on an element or a canvas context: accept every call, remember text.
const stub = () => new Proxy(function () {}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
    if (k === 'style') return {};
    if (k === 'getContext') return () => stub();
    if (k === 'toBlob') return cb => cb(null);
    if (k === 'contains') return () => false;
    if (k === 'measureText') return () => ({ width: 0 });
    return stub();
  },
  set(t, k, v) { t[k] = v; return true; },
  apply() { return stub(); },
});
const elements = new Map();
const document = {
  querySelector: sel => { if (!elements.has(sel)) elements.set(sel, stub()); return elements.get(sel); },
  getElementById: id => document.querySelector('#' + id),
  createElement: () => stub(),
  addEventListener() {},
  body: stub(),
  fonts: { load: () => Promise.resolve([]) },
};
const context = vm.createContext({
  document, console, setTimeout, clearTimeout, TextDecoder, DataView, Uint8Array, Float64Array,
  Map, Set, Promise, Math, JSON, Number, String, Array, Object, Error, RegExp, Date, Infinity, BigInt,
  File, Blob, isFinite, parseInt,
  navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
  matchMedia: () => ({ matches: false }),
  fetch: async url => {
    const body = readFileSync(join(ROOT, String(url).replace(/^\.\//, '')), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  },
});
context.window = context;
vm.runInContext(script + '\n;globalThis.__t = { handle, get lastRun(){ return lastRun; }, get FEATS(){ return FEATS; } };', context);

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [new File([readFileSync(p)], n)];
});
const T = context.__t;
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const summarize = () => {
  const found = new Map();
  for (const [fi, a] of T.lastRun.agg){ const f = T.FEATS[fi]; found.set(f.n, { counted: !!f.k, y0: a.y0, y1: a.y1, photos: a.photos, points: a.points }); }
  return found;
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 1. Every fixture at once: formats, enclaves, territories, snapping, de-duplication.
await T.handle(walk(join(ROOT, 'tests', 'fixtures')));
let found = summarize(), stats = T.lastRun.stats;
const counted = [...found].filter(([, v]) => v.counted).map(([n]) => n).sort();
const other = [...found].filter(([, v]) => !v.counted).map(([n]) => n).sort();
console.log(`fixtures: ${counted.length} countries: ${counted.join(', ')} | also: ${other.join(', ')}`);
console.log(`stats: ${JSON.stringify(stats)}`);
check(same(counted, ['Algeria', 'Argentina', 'Canada', 'France', 'Iceland', 'Italy', 'Japan', 'Malta', 'Mexico',
  'Monaco', 'Morocco', 'Portugal', 'Singapore', 'South Korea', 'United States']), 'counted countries');
check(same(other, ['Hong Kong', 'Vatican City']), 'territories and non-UN states listed separately');
check(stats.withLoc === 13, `photos and videos with a location: ${stats.withLoc}`);   // fails if the HEIC, video or TIFF path breaks
check(stats.sidecars === 1, `Takeout sidecars counted: ${stats.sidecars}`);         // tokyo.jpg.json duplicates tokyo.jpg
check(stats.unmatched === 1, `unplaceable points: ${stats.unmatched}`);             // the mid-Atlantic photo
check(found.get('Mexico').y0 === 2024 && found.get('South Korea').y0 === 2025, 'Timeline.json years');
check(found.get('Argentina').y0 === 2012, 'location-history.json (iPhone) year');
check(found.get('Morocco').y0 === 2013 && found.get('Algeria').y0 === 2013, 'Records.json years');

// 2. An older Takeout Records.json writes "timestampMs" before the coordinates.
const oldRecords = JSON.stringify({ locations: [
  { timestampMs: '1418000000000', latitudeE7: 356812000, longitudeE7: 1397671000, accuracy: 10 },
  { timestampMs: '1500000000000', latitudeE7: 488584000, longitudeE7: 22945000, accuracy: 10 },
] });
await T.handle([new File([oldRecords], 'Location History.json')]);
found = summarize();
check(found.get('Japan')?.y0 === 2014 && found.get('France')?.y0 === 2017, `timestampMs years: Japan ${found.get('Japan')?.y0}, France ${found.get('France')?.y0}`);

// 3. Files bigger than one 8 MB slice, with a coordinate straddling the slice boundary at every offset.
const rec = i => `{"point": "40.7128°, -74.0060°", "time": "2024-01-0${1 + i % 9}T00:00:00Z"},`;
let straddled = 0;
const PERIOD = rec(0).length;   // every offset within one record, so the cut lands inside the latitude, the longitude and between points
for (let pad = 0; pad < PERIOD; pad++){
  const head = '{"timelinePath": [' + ' '.repeat(pad);
  const body = [];
  let len = head.length, n = 0;
  while (len < 8 * 1024 * 1024 + 4096){ const r = rec(n++); body.push(r); len += r.length; }
  const text = head + body.join('') + '{}]}';
  await T.handle([new File([text], 'Timeline.json')]);
  found = summarize(); stats = T.lastRun.stats;
  if (stats.points !== n || found.size !== 1 || !found.has('United States')){
    check(false, `slice boundary, pad ${pad}: ${stats.points} points of ${n}, countries ${[...found.keys()].join(', ')}`);
    break;
  }
  straddled++;
}
console.log(`slice-boundary files: ${straddled} of ${PERIOD} read exactly`);

if (failures.length){ console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('PASS');
process.exit(0);
