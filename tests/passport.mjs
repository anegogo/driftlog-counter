// The passport page (/passport/): the stamp, grid, caption and link helpers in /kit.js, the drawing (on a canvas
// that records what is drawn), then passport/index.html's own script in a stubbed DOM. `node tests/passport.mjs`.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT, loadPage, stub, kitSource } from './harness.mjs';

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const sleep = ms => new Promise(res => setTimeout(res, ms));
let seed = 20260925;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const { Kit } = loadPage();
const ALL = Kit.COUNTRIES.map(c => c.code);
const pick = n => { const a = ALL.slice(); for (let i = a.length - 1; i > 0; i--){ const j = (rand() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return new Set(a.slice(0, n)); };
const NOTE = '194 = 193 UN members + Taiwan';

// 1. Stamps: the app's tilt, and the sheets' layout as the stamp export wrote it (stamps/index.json, when present).
check(Kit.stampTilt('AD') === 6 && Kit.stampTilt('AE') === 7 && Kit.stampTilt('AG') === -8 && Kit.stampTilt('AL') === -3, 'tilt = the app\'s formula');
check(ALL.every(c => Kit.stampTilt(c) >= -8 && Kit.stampTilt(c) <= 8), 'every tilt is within -8..+8');
if (existsSync(join(ROOT, 'stamps', 'index.json'))){
  const idx = JSON.parse(readFileSync(join(ROOT, 'stamps', 'index.json'), 'utf8'));
  check(idx.countries.map(c => c.code).join() === ALL.join(), 'stamps/index.json is in the table order');
  check(idx.countries.every((c, i) => c.sheet === Math.floor(i / 49) && c.x === (i % 49) % 7 * 240 && c.y === Math.floor((i % 49) / 7) * 240), 'every stamp sits where the formula puts it');
  check(idx.countries.every(c => c.appRotateDeg === Kit.stampTilt(c.code)), 'the export\'s appRotateDeg = stampTilt for all 194');
}

// 2. The grid: at most 240 px (the stamps' size), room for every stamp plus an empty slot, inside the page.
const P = Kit.PASSPORT;
let prev = Infinity, gridOk = true;
for (let n = 0; n <= 194; n++){
  const g = Kit.passportGrid(n), cells = g.cols * g.rows;
  if (!(g.s <= 240 && g.s <= prev && cells >= Math.min(n + 1, 194) && g.x >= P.gx && g.y >= P.gy
    && g.x + g.cols * g.s <= P.gx + P.gw + 0.01 && g.y + g.rows * g.s <= P.gy + P.gh + 0.01)) { gridOk = false; failures.push(`grid for ${n}: ${JSON.stringify(g)}`); }
  prev = g.s;
}
check(gridOk, 'grid fits for every count 0–194');
check(Kit.passportGrid(1).s === 240 && Kit.passportGrid(37).s === 160 && Kit.passportGrid(194).cols * Kit.passportGrid(194).rows >= 194, `grid sizes: 1 → ${Kit.passportGrid(1).s}, 37 → ${Kit.passportGrid(37).s}, 194 → ${Kit.passportGrid(194).s} px`);

// 3. The caption: "photos" only for a list counted from photos.
check(Kit.passportCaption('tap') === NOTE && Kit.passportCaption(null) === NOTE, 'picked by hand or unknown: only the 194 note');
check(Kit.passportCaption('photos') === 'counted from my photos · ' + NOTE, 'photos');
check(Kit.passportCaption('timeline') === 'counted from my location history · ' + NOTE, 'timeline: no "photos"');
check(Kit.passportCaption('both') === 'counted from my photos and location history · ' + NOTE, 'photos and timeline');
check(Kit.passportCaption('edited', 'photos') === 'counted from my photos, then edited by hand · ' + NOTE, 'edited photos');
check(Kit.passportCaption('edited', 'timeline') === 'counted from my location history, then edited by hand · ' + NOTE, 'edited timeline: no "photos"');
check(Kit.passportCaption('edited') === 'counted from my files, then edited by hand · ' + NOTE, 'edited, source unknown: "files"');
check(Kit.passportCaption('example') === NOTE && Kit.passportCaption('<b>') === NOTE, 'anything else: only the 194 note');

// 4. The link from the counter: /passport/#v=1.<mask>[&y=<years>][&s=<src>[&b=<base>]], and nothing else gets in.
let bad = 0;
for (let t = 0; t < 1000; t++){
  const codes = pick((rand() * 195) | 0), years = t % 2 ? new Map([...codes].map(c => [c, 1976 + ((rand() * 60) | 0)])) : null;
  const src = Kit.PASSPORT_SRC[t % 5], base = ['photos', 'timeline', 'both'][t % 3];
  const back = Kit.readPassport('#' + Kit.passportHash(codes, years, src, base));
  if (!back || !sameSet(back.codes, codes) || back.src !== src || back.base !== (src === 'edited' ? base : null)
    || (years ? ![...codes].every(c => back.years.get(c) === years.get(c)) : back.years !== null)) bad++;
}
check(bad === 0, `passport links: ${bad} of 1000 did not come back`);
const one = Kit.linkHash(['JP']);
check(Kit.readPassport(`#${one}&s=example`).src === null && Kit.readPassport(`#${one}&s=PHOTOS`).src === null && Kit.readPassport(`#${one}&s=photos2`).src === null, 'unknown sources are dropped');
check(Kit.readPassport(`#${one}&s=tap&b=photos`).base === null && Kit.readPassport(`#${one}&s=edited&b=tap`).base === null, 'b= only with s=edited, and only photos, timeline or both');
check(!Kit.passportHash(['JP'], null, 'example').includes('&s='), 'the example is never handed over as a source');
check(Kit.readPassport(`#${one.replace('=', '%3D')}%26s%3Dphotos`).src === 'photos', 'a percent-encoded # still reads');
check(Kit.readPassport('#v=1.!!&s=photos').error === 'broken' && Kit.readPassport('#app') === null, 'broken and foreign #: as readLink');

// 5. Drawing, on a canvas that records every call: stamps in reveal order from the right cells, the texts, the slots.
function recorder(){
  const calls = [], props = {};
  const ctx = new Proxy(props, {
    get(t, k){
      if (k in t) return t[k];
      if (k === 'measureText') return s => ({ width: String(s).length * parseFloat(/(\d+)px/.exec(t.font || '10px')[1]) * 0.5 });
      return (...a) => { calls.push([k, a]); };
    },
    set(t, k, v){ t[k] = v; return true; },
  });
  return { canvas: { width: 1080, height: 1920, getContext: () => ctx }, calls };
}
const SHEETS = [0, 1, 2, 3].map(k => ({ sheet: k }));
for (const n of [0, 1, 37, 194]){
  const codes = n === 194 ? new Set(ALL) : pick(n), years = new Map([...codes].filter(() => rand() < 0.7).map(c => [c, 2000 + ((rand() * 26) | 0)]));
  const order = Kit.revealOrder(codes, years), { canvas, calls } = recorder();
  const text = Kit.drawPassport(canvas, { order, sheets: SHEETS, src: 'photos' });
  const imgs = calls.filter(c => c[0] === 'drawImage').map(c => c[1]);
  const where = code => { const i = ALL.indexOf(code), j = i % 49; return [Math.floor(i / 49), (j % 7) * 240, Math.floor(j / 7) * 240]; };
  check(imgs.length === n && imgs.every((a, k) => { const [s, x, y] = where(order[k]); return a[0].sheet === s && a[1] === x && a[2] === y && a[3] === 240 && a[4] === 240; }),
    `${n} countries: ${imgs.length} stamps drawn, each from its own cell, in reveal order`);
  const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1][0]);
  check(text.title === `My passport page · ${n} of 194` && texts.includes(text.title), `${n}: title "${text.title}"`);
  check(text.toGo === (n < 194 ? `${194 - n} to go` : 'All 194') && texts.includes(text.toGo), `${n}: "${text.toGo}"`);
  check(texts.includes('counted from my photos · ' + NOTE) && texts.includes('driftlog-counter.pages.dev/passport'), `${n}: caption and address`);
  const g = Kit.passportGrid(n), slots = calls.filter(c => c[0] === 'setLineDash' && c[1][0].length).length;
  check(slots === (n < 194 ? g.cols * g.rows - n : 0), `${n}: ${slots} empty slots`);
}
{ // A sheet that did not load: those stamps become rings with the name, the rest are drawn as usual.
  const { canvas, calls } = recorder();
  Kit.drawPassport(canvas, { order: ['AD', 'ZW'], sheets: [SHEETS[0], null, null, null], src: 'tap' });
  const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1][0]);
  check(calls.filter(c => c[0] === 'drawImage').length === 1 && texts.includes('ZIMBABWE') && !texts.some(t => /photos/.test(t)), 'a missing sheet: a ring with the name, no "photos" when picked');
}

// 6. The page's own script: a list from the counter, a reload, blocked storage, a broken link, a fresh visit.
const html = readFileSync(join(ROOT, 'passport', 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('</script>'));
function openPage({ hash = '', storage = new Map(), blocked = false } = {}){
  const elements = new Map(), replaced = [], images = [];
  const document = {
    querySelector: sel => { if (!elements.has(sel)) elements.set(sel, stub()); return elements.get(sel); },
    createElement: () => stub(), addEventListener() {}, body: stub(), head: stub(), getElementById: id => document.querySelector('#' + id),
    fonts: { load: () => Promise.resolve([]) }, title: '',
  };
  const sessionStorage = {
    getItem: k => { if (blocked) throw new Error('SecurityError'); return storage.has(k) ? storage.get(k) : null; },
    setItem: (k, v) => { if (blocked) throw new Error('SecurityError'); storage.set(k, String(v)); },
  };
  class FakeImage { set src(v){ this._src = v; images.push(v); setTimeout(() => this.onload && this.onload(), 1); } get src(){ return this._src; } decode(){ return Promise.resolve(); } }
  const context = vm.createContext({
    document, console, setTimeout, clearTimeout, Map, Set, Promise, Math, JSON, Number, String, Array, Object, Error, RegExp, Date,
    Infinity, File, Blob, isFinite, parseInt, Image: FakeImage, sessionStorage,
    navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false }),
    location: { hash, pathname: '/passport/' },
    history: { replaceState: (s, t, url) => replaced.push(url) },
    addEventListener() {}, URL,
  });
  context.window = context;
  vm.runInContext(kitSource, context, { filename: 'kit.js' });
  vm.runInContext(script + '\n;globalThis.__p = { get state(){ return state; } };', context, { filename: 'passport/index.html' });
  const text = sel => { const v = elements.has(sel) ? elements.get(sel).textContent : undefined; return typeof v === 'string' ? v : ''; };
  const attr = sel => { const e = elements.get(sel); return e && e.__label; };
  return { P: context.__p, replaced, images, storage, text, elements };
}
const list = pick(37), years = new Map([...list].slice(0, 30).map((c, k) => [c, 2005 + (k % 20)]));
const mask = Kit.linkHash(list);
let page = openPage({ hash: '#' + Kit.passportHash(list, years, 'photos') });
await sleep(30);
check(page.P.state && sameSet(page.P.state.codes, list) && page.P.state.src === 'photos' && page.P.state.years.size === 30, 'from the counter: list, 30 years and the source');
check(page.replaced[0] === '/passport/#' + mask, `the address bar keeps only the list: ${page.replaced[0]}`);
check(page.text('#outTitle') === 'My passport page · 37 of 194' && page.text('#order').startsWith('Stamped in order of first visit'), `heading and order note: ${page.text('#order').slice(0, 40)}`);
check(page.images.length === 4 && page.images.every((u, k) => u === `/stamps/sheet-${k}.webp`), `the four fixed sheets, nothing else: ${page.images.join(' ')}`);
const saved = JSON.parse(page.storage.get('driftlog-passport'));
check(saved.v === mask && saved.src === 'photos' && saved.years.length === 30, 'this tab\'s storage keeps the years and the source');
// A reload: only v= in the address, the rest from storage.
page = openPage({ hash: '#' + mask, storage: page.storage });
await sleep(30);
check(page.P.state.src === 'photos' && page.P.state.years && page.P.state.years.size === 30, 'reload: years and source come back');
// Storage blocked, or holding another list: the list alone, no claim about photos.
for (const opts of [{ blocked: true }, { storage: new Map([['driftlog-passport', JSON.stringify({ v: Kit.linkHash(['JP']), years: [['JP', 2010]], src: 'photos' })]]) }]){
  page = openPage(Object.assign({ hash: '#' + mask }, opts));
  await sleep(30);
  check(page.P.state && page.P.state.codes.size === 37 && page.P.state.src === null && page.P.state.years === null && page.text('#order').startsWith('No dates came with this list'),
    `${opts.blocked ? 'storage blocked' : 'storage for another list'}: the 37, no years, no source`);
}
// Picked by hand on the counter.
page = openPage({ hash: '#' + Kit.passportHash(list, null, 'tap') });
await sleep(30);
check(page.P.state.src === 'tap' && page.text('#order').startsWith('Picked by hand'), 'picked on the counter: "Picked by hand"');
// A broken link, and a fresh visit: the picker (no Cancel), nothing fetched.
page = openPage({ hash: '#v=1.!!' });
await sleep(30);
check(page.P.state === null && page.text('#status').includes('could not be read') && /kp-ok/.test(page.elements.get('#picker').innerHTML), 'broken link: the picker with a note');
page = openPage();
await sleep(30);
const pk = page.elements.get('#picker').innerHTML;
check(page.P.state === null && /Make my page/.test(pk) && !/kp-x/.test(pk) && page.images.length === 0, 'fresh visit: the picker, no Cancel, no sheets fetched');
page = openPage({ hash: '#' + Kit.linkHash([]) });
await sleep(30);
check(page.P.state.codes.size === 0 && page.images.length === 0 && page.text('#outTitle') === 'My passport page · 0 of 194', 'no countries: an empty page, no sheets fetched');

if (failures.length){ console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('PASS');
process.exit(0);
