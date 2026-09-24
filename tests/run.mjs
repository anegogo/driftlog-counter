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
const files = walk(join(ROOT, 'tests', 'fixtures'));
await context.__t.handle(files);

const run = context.__t.lastRun;
if (!run) { console.error('No result. Status:', elements.get('#status')?.textContent); process.exit(1); }
const found = new Map();
for (const [fi, a] of run.agg) {
  const f = context.__t.FEATS[fi];
  found.set(f.n, { counted: !!f.k, y0: a.y0, y1: a.y1 });
}
const expect = {
  counted: ['Algeria', 'Argentina', 'Canada', 'France', 'Iceland', 'Italy', 'Japan', 'Malta', 'Mexico',
            'Monaco', 'Morocco', 'Portugal', 'Singapore', 'South Korea', 'United States'],
  notCounted: ['Hong Kong', 'Vatican City'],
};
const counted = [...found].filter(([, v]) => v.counted).map(([n]) => n).sort();
const other = [...found].filter(([, v]) => !v.counted).map(([n]) => n).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const ok = same(counted, expect.counted) && same(other, expect.notCounted);
console.log(`${counted.length} countries: ${counted.join(', ')}`);
console.log(`also found: ${other.join(', ')}`);
console.log(`stats: ${JSON.stringify(run.stats)}`);
if (!ok) {
  console.error('FAIL\nexpected:', expect);
  process.exit(1);
}
console.log('PASS');
process.exit(0);
