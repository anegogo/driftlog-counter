// Tests for the year page (/2026/) of the counter: /scan.js, /year.js and the page's own inline script, loaded
// into a VM with a stubbed DOM the way tests/harness.mjs loads the counter. No browser, no dependencies.
//   node tests/pages/year.mjs [site dir]        (Node 20+; the site defaults to this repository)
// The fixtures are the counter's own (tests/fixtures).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = process.argv[2] || join(HERE, '..', '..');
const FIXTURES = join(HERE, '..', 'fixtures');
const read = (...p) => readFileSync(join(SITE, ...p), 'utf8');
const failures = [];
let checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { failures.push(msg); console.log('FAIL ' + msg); } };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sorted = it => [...it].sort();

// Anything a page touches on an element or a canvas context: accept every call, remember what is set.
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
// Loads a page of the site: the scripts it names, then its last inline <script>, with `expose` appended so the
// test can reach the page's own functions and state.
function loadPage(htmlRel, scripts, expose) {
  const html = read(htmlRel);
  const script = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('</script>'));
  const elements = new Map();
  const document = {
    querySelector: sel => { if (!elements.has(sel)) elements.set(sel, stub()); return elements.get(sel); },
    getElementById: id => document.querySelector('#' + id),
    createElement: () => stub(),
    addEventListener() {},
    body: stub(), head: stub(),
    fonts: { load: () => Promise.resolve([]) },
    title: '',
  };
  const context = vm.createContext({
    document, console, setTimeout, clearTimeout, TextDecoder, DataView, Uint8Array, Float64Array, URL,
    Map, Set, Promise, Math, JSON, Number, String, Array, Object, Error, RegExp, Date, Infinity, BigInt,
    File, Blob, isFinite, parseInt,
    navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false }),
    location: { hash: '', pathname: '/' },
    history: { replaceState() {} },
    addEventListener() {},
    fetch: async url => {
      const body = read(String(url).replace(/^\.?\//, ''));
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    },
  });
  context.window = context;
  for (const s of scripts) vm.runInContext(read(s), context, { filename: s });
  vm.runInContext(script + '\n;globalThis.__t = ' + expose + ';', context, { filename: htmlRel });
  const text = sel => { const v = elements.has(sel) ? elements.get(sel).textContent : undefined; return typeof v === 'string' ? v : ''; };
  return { T: context.__t, context, text, el: sel => document.querySelector(sel) };
}
const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [new File([readFileSync(p)], n)];
});
const yearPage = () => loadPage('2026/index.html', ['kit.js', 'scan.js', 'year.js'],
  `{ handle, showCount, openPicker, showExample, render, ready, get files(){ return files; }, get state(){ return state; },
     get edits(){ return edits; }, get FEATS(){ return FEATS; }, get locate(){ return locate; } }`);

// ---------- 1. the readers in /scan.js find what the counter's own readers find ----------
const counter = loadPage('index.html', ['kit.js', 'video.js'], '{ handle, get lastRun(){ return lastRun; }, get FEATS(){ return FEATS; } }');
await counter.T.handle(walk(FIXTURES));
const page = yearPage();
const { Kit, Scan, Year } = { Kit: page.context.DriftlogKit, Scan: page.context.DriftlogScan, Year: page.context.DriftlogYear };
await page.T.handle(walk(FIXTURES));
{
  const a = counter.T.lastRun, b = page.T.files;
  check(!!b, 'the year page kept its count from files');
  const name = fi => counter.T.FEATS[fi].n;
  const left = new Map([...a.agg].map(([fi, r]) => [name(fi), { n: r.photos + r.points, y0: r.y0, y1: r.y1 }]));
  const right = new Map([...b.tally.feats].map(([fi, r]) => {
    const ys = [...r.years.keys()];
    return [page.T.FEATS[fi].n, { n: r.n, y0: ys.length ? Math.min(...ys) : null, y1: ys.length ? Math.max(...ys) : null }];
  }));
  check(same(sorted(left.keys()), sorted(right.keys())), `same places: ${sorted(left.keys()).join(', ')} | ${sorted(right.keys()).join(', ')}`);
  for (const [n, l] of left) {
    const r = right.get(n) || {};
    check(l.n === r.n && l.y0 === r.y0 && l.y1 === r.y1, `${n}: counter ${JSON.stringify(l)}, scan.js ${JSON.stringify(r)}`);
  }
  for (const k of ['media', 'withLoc', 'sidecars', 'points', 'unmatched'])
    check(a.stats[k] === b.stats[k], `stats.${k}: counter ${a.stats[k]}, year page ${b.stats[k]}`);
  console.log(`readers: ${left.size} places agree with the counter (${[...left.values()].reduce((s, r) => s + r.n, 0)} locations)`);
}

// ---------- 2. months ----------
{
  const t = page.T.files.tally, F = page.T.FEATS;
  const months = (name, year) => { for (const [fi, a] of t.feats) if (F[fi].n === name && a.years.has(year)) return Year.monthNames(a.years.get(year).months).join(','); return null; };
  for (const [name, year, want] of [['Mexico', 2024, 'Feb'], ['South Korea', 2025, 'Mar'], ['Argentina', 2012, 'Jan'], ['Morocco', 2013, 'May'],
    ['Algeria', 2013, 'May'], ['Japan', 2017, 'Aug'], ['Iceland', 2023, 'Jul'], ['Canada', 2023, 'Jul'], ['Singapore', 2018, 'Mar'],
    ['Malta', 2021, 'Apr'], ['United States', 2022, 'Oct'], ['Portugal', 2014, 'Jun'], ['Italy', 2016, 'May'], ['Hong Kong', 2019, 'Dec']])
    check(months(name, year) === want, `${name} ${year}: months ${months(name, year)}, expected ${want}`);
  check(t.undated === 1, `locations with no date: ${t.undated} (the video, whose header has no creation time)`);
  check(JSON.stringify(Scan.exifDate('2026:03:14 09:26:53')) === '{"year":2026,"month":3}', 'exifDate');
  check(Scan.exifDate('0000:00:00 00:00:00') === null, 'exifDate: a camera that never set its clock');
  check(JSON.stringify(Scan.exifDate('2026:13:01 00:00:00')) === '{"year":2026,"month":null}', 'exifDate: a month that cannot be right');
  // movie headers: version 0 (32-bit seconds since 1904) and version 1 (64-bit); 0 means the clock was never set.
  const mvhd = (ver, secs) => {
    const buf = new ArrayBuffer(64), v = new DataView(buf);
    [...'mvhd'].forEach((ch, i) => v.setUint8(8 + i, ch.charCodeAt(0)));
    v.setUint8(12, ver);
    if (ver === 1) v.setBigUint64(16, BigInt(secs)); else v.setUint32(16, secs);
    return [new TextDecoder('latin1').decode(buf), v];
  };
  const at = Date.UTC(2026, 2, 14, 12) / 1000 + 2082844800;
  check(JSON.stringify(Scan.movieDate(...mvhd(0, at))) === '{"year":2026,"month":3}', 'movieDate, version 0');
  check(JSON.stringify(Scan.movieDate(...mvhd(1, at))) === '{"year":2026,"month":3}', 'movieDate, version 1');
  check(Scan.movieDate(...mvhd(0, 0)) === null, 'movieDate: creation time 0');
  // An older Takeout Records.json writes "timestampMs" before the coordinates.
  const got = [];
  await Scan.scanLocationFile(new File([JSON.stringify({ locations: [
    { timestampMs: String(Date.UTC(2026, 10, 2)), latitudeE7: 356812000, longitudeE7: 1397671000 },
    { timestampMs: String(Date.UTC(2014, 11, 8)), latitudeE7: 488584000, longitudeE7: 22945000 }] })], 'Location History.json'),
    (p, y, m) => got.push([y, m]));
  check(JSON.stringify(got) === '[[2026,11],[2014,12]]', `timestampMs dates: ${JSON.stringify(got)}`);
  // A file bigger than one 8 MB slice: every point read once, each in its own month.
  for (const pad of [0, 17, 41]) {
    const rec = i => `{"point": "40.7128°, -74.0060°", "time": "2026-0${1 + i % 9}-15T00:00:00Z"},`;
    const body = [];
    let len = 0, n = 0;
    while (len < 8 * 1024 * 1024 + 4096) { const r = rec(n++); body.push(r); len += r.length; }
    const seen = new Array(13).fill(0);
    let points = 0;
    await Scan.scanLocationFile(new File(['{"startTime": "2026-01-15T00:00:00Z", "timelinePath": [' + ' '.repeat(pad) + body.join('') + '{}]}'], 'Timeline.json'),
      (p, y, m) => { points++; if (y === 2026) seen[m]++; });
    check(points === n, `slice boundary, pad ${pad}: ${points} points of ${n}`);
    check(seen.slice(1, 10).every(k => Math.abs(k - n / 9) <= 2) && seen.slice(10).every(k => k === 0), `slice boundary, pad ${pad}: months ${seen.slice(1).join(',')}`);
  }
}

// ---------- 3. one year out of the count ----------
{
  const t = page.T.files.tally, F = page.T.FEATS;
  const v16 = Year.yearView(t, F, 2016);
  check(same(sorted(v16.codes), ['FR', 'IT', 'MC']), `2016: ${sorted(v16.codes)}`);
  check(same(v16.others, ['Vatican City']), `2016, outside the 194: ${v16.others}`);
  check(same(sorted(v16.earlier), ['AR', 'DZ', 'MA', 'PT']), `before 2016: ${sorted(v16.earlier)}`);
  check(same(sorted(v16.newCodes), ['FR', 'IT', 'MC']), `new in 2016: ${sorted(v16.newCodes)}`);
  check(v16.latest === 2025 && Year.totalOf(v16) === 7, `latest ${v16.latest}, so far ${Year.totalOf(v16)}`);
  check(Year.perMonth(v16).join('') === '000030000000', `2016 by month: ${Year.perMonth(v16).join('')}`);
  const v26 = Year.yearView(t, F, 2026);
  check(v26.codes.size === 0 && v26.others.length === 0 && v26.latest === 2025, 'nothing in the fixtures is dated 2026');
  check(v26.newCodes && v26.newCodes.size === 0 && v26.earlier.size === 15, `2026: earlier years are known (${v26.earlier.size})`);

  const code = (lon, lat) => page.T.locate(lon, lat);
  const tokyo = code(139.77, 35.68), seoul = code(126.98, 37.57), paris = code(2.35, 48.86), cayenne = code(-52.33, 4.93);
  const t2 = Year.newTally();
  Year.tallyAdd(t2, tokyo, 2022, 10); Year.tallyAdd(t2, tokyo, 2026, 3); Year.tallyAdd(t2, tokyo, 2026, 4);
  Year.tallyAdd(t2, seoul, 2026, 4); Year.tallyAdd(t2, seoul, null, null);
  const v = Year.yearView(t2, F, 2026);
  check(same(sorted(v.codes), ['JP', 'KR']) && same(sorted(v.newCodes), ['KR']) && same(sorted(v.earlier), ['JP']), 'new means nothing dated before the year');
  check(Year.monthNames(v.months.get('JP')).join() === 'Mar,Apr' && Year.perMonth(v).join('') === '001200000000', 'months of the year only');
  check(same(Year.orderOf(v), ['JP', 'KR']) && t2.undated === 1 && Year.totalOf(v) === 2, 'order by first month; undated locations are in no year');
  check(Year.shareText(v) === 'My 2026 in travel: 2 countries, 1 of them new to me. Make yours:', Year.shareText(v));

  const only = Year.newTally();
  Year.tallyAdd(only, tokyo, 2026, 3); Year.tallyAdd(only, seoul, 2027, 1);
  const vo = Year.yearView(only, F, 2026);
  check(vo.newCodes === null && vo.earlier === null && Year.totalOf(vo) === null, 'with no earlier year in the files, nothing is called new');
  check(Year.shareText(vo) === 'My 2026 in travel: 1 country. Make yours:', Year.shareText(vo));

  // France: a year in Paris does not paint Guiana, and an earlier year in Guiana does not make Paris pale.
  const fr = Year.newTally();
  Year.tallyAdd(fr, cayenne, 2020, 1); Year.tallyAdd(fr, paris, 2026, 7);
  const vf = Year.yearView(fr, F, 2026), L = Year.mapLayers(F, vf), fi = Math.floor(paris / 10000);
  check(vf.newCodes.size === 0 && L.layerOf(fi).on(paris % 10000) && !L.layerOf(fi).on(cayenne % 10000), 'France: only the part that was visited this year is painted');

  const e = Year.editView(v, new Set(['JP', 'FR', 'XX']));
  check(same(sorted(e.codes), ['FR', 'JP']) && e.months.has('JP') && !e.months.has('KR') && e.newCodes.size === 0, 'edited by hand: what is known about the rest is kept');
  const p = Year.pickedView(2026, new Set(['JP', 'KR']));
  check(p.months === null && p.newCodes === null && !Year.monthsKnown(p) && Year.caption('tap') === 'picked by hand', 'picked by hand: no months, nothing new, and no word about photos');
}

// ---------- 4. the card ----------
{
  // A context that measures text roughly (0.55 em a character), so wrapping and "+N more" can be tested.
  const ctx = () => { const drawn = []; return new Proxy({ font: '10px x', drawn, measureText(s) { return { width: [...s].length * +/(\d+)px/.exec(this.font)[1] * 0.55 }; }, fillText(s) { drawn.push(s); } },
    { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, val) => { t[k] = val; return true; } }); };
  const canvas = () => { const c = ctx(); return { getContext: () => c, c }; };
  const F = page.T.FEATS;
  await page.T.showExample();
  const ex = page.T.state;
  check(ex.example && ex.view.codes.size === 7 && same(sorted(ex.view.newCodes), ['CH', 'IS', 'KR']) && Year.totalOf(ex.view) === 11, `example: ${ex.view.codes.size} countries, new ${sorted(ex.view.newCodes)}, so far ${Year.totalOf(ex.view)}`);
  let cv = canvas(), text = Year.drawYearCard(cv, F, ex.view, { src: 'example' });
  check(text.title === 'Example · 2026 in travel' && text.count === '7 countries' && text.sub === '3 new · 11 so far', `example card: ${text.title} / ${text.count} / ${text.sub}`);
  check(same(text.groups.map(g => g.label), ['NEW', 'BEEN BEFORE']) && text.groups[0].names.length === 3 && text.groups[1].names.length === 4 && text.more === 0, 'example card: new first, then the rest');
  check(text.caption === 'example data, not real photos' && text.url === 'getdriftlog.com/2026', 'example card: says it is an example');
  check(text.months.join('') === '111210211000' && cv.c.drawn.includes('DRIFTLOG'), `example card: by month ${text.months.join('')}`);

  text = Year.drawYearCard(canvas(), F, ex.view, { src: 'photos' });
  check(text.title === 'My 2026 in travel' && text.sub === '3 new to me · 11 so far' && text.groups[0].label === 'NEW TO ME' && text.caption === 'counted from my own photos, in my own browser', 'a card counted from photos');
  text = Year.drawYearCard(canvas(), F, Object.assign({}, ex.view, { newCodes: null }), { src: 'photos' });
  check(text.sub === '11 so far' && text.groups.length === 1 && text.groups[0].label === null, 'with "new" switched off, the card does not say it');
  text = Year.drawYearCard(canvas(), F, Year.pickedView(2026, new Set(['JP', 'KR', 'IT'])), { src: 'tap' });
  check(text.sub === '' && text.months === null && text.groups.length === 1 && text.groups[0].names.length === 3 && text.caption === 'picked by hand', 'a card picked by hand');
  const allNew = Object.assign({}, ex.view, { newCodes: new Set(ex.view.codes) });
  check(Year.drawYearCard(canvas(), F, allNew, { src: 'photos' }).groups[0].label === 'ALL NEW TO ME', 'every country new');
  text = Year.drawYearCard(canvas(), F, Year.pickedView(2026, new Set(['JP'])), { src: 'tap' });
  check(text.count === '1 country', 'one country');
  text = Year.drawYearCard(canvas(), F, Year.pickedView(2026, new Set()), { src: 'tap' });
  check(text.count === '0 countries' && text.groups.length === 0, 'no countries');
  const many = new Set(Kit.COUNTRIES.map(c => c.code));
  text = Year.drawYearCard(canvas(), F, Year.pickedView(2026, many), { src: 'tap' });
  const names = text.groups.flatMap(g => g.names);
  check(text.more > 0 && names[names.length - 1] === `+${text.more} more` && names.length - 1 + text.more === 194, `194 countries: ${names.length - 1} named, ${text.more} more`);
}

// ---------- 5. the page: counting, a year with nothing in it, editing, adding ----------
{
  const P = yearPage(), T = P.T;
  let picker = null;
  P.context.DriftlogKit.picker = (host, o) => { picker = o; };
  await T.handle(walk(FIXTURES));
  check(T.state === null && /none is dated 2026: the latest year in those files is 2025/.test(P.text('#status')), `no 2026 in the files: "${P.text('#status')}"`);
  const timeline = recs => new File([JSON.stringify({ semanticSegments: recs.map(([lat, lon, date]) => ({ startTime: date + 'T10:00:00.000Z', endTime: date + 'T12:00:00.000Z', visit: { topCandidate: { placeLocation: { latLng: `${lat}°, ${lon}°` } } } })) })], `Timeline-${recs.length}-${recs[0][2]}.json`);
  const first = timeline([[35.68, 139.77, '2026-03-10'], [-23.55, -46.63, '2026-07-02']]);
  await T.handle([first], { adding: true });
  let st = T.state;
  check(st && same(sorted(st.view.codes), ['BR', 'JP']) && same(sorted(st.view.newCodes), ['BR']) && st.src === 'both', `this year's file added to the count: ${st && sorted(st.view.codes)} from ${st && st.src}`);
  check(P.text('#outTitle') === '2 countries in 2026' && /^One of them is new/.test(P.text('#outNote')), `heading "${P.text('#outTitle')}", note "${P.text('#outNote')}"`);
  check(/Japan/.test(P.el('#yearList').innerHTML) && /<span class="new">new<\/span><span class="mo">Jul<\/span>/.test(P.el('#yearList').innerHTML), 'the list under the card: months, and which is new');
  await T.handle([first], { adding: true });
  check(P.text('#status') === 'That file was counted already.', 'the same file twice');

  T.openPicker(true);
  check(same(sorted(picker.initial), ['BR', 'JP']) && picker.doneLabel === 'Update my card', 'Edit opens the picker on this year\'s list');
  await picker.onDone(new Set(['BR', 'DE']));
  st = T.state;
  check(same(sorted(st.view.codes), ['BR', 'DE']) && st.src === 'edited' && st.base === 'both' && st.view.months.has('BR') && !st.view.months.has('DE'), `edited: ${sorted(st.view.codes)} ${st.src}/${st.base}`);
  check(/added by hand/.test(P.el('#yearList').innerHTML) && /^Counted from your files, then edited by hand\./.test(P.text('#outNote')), 'an edited list says so');
  await T.handle([timeline([[-1.29, 36.82, '2026-08-20']])], { adding: true });
  st = T.state;
  check(same(sorted(st.view.codes), ['BR', 'DE', 'KE']) && st.src === 'edited' && same(sorted(st.view.newCodes), ['BR', 'KE']), `a later batch keeps the edit: ${sorted(st.view.codes)}`);

  T.openPicker(false);
  await picker.onDone(new Set(['IT']));
  st = T.state;
  check(st.src === 'tap' && T.files === null && st.view.months === null && P.text('#outTitle') === '1 country in 2026', 'picked from scratch: the count from files is let go');
  check(/^Picked by hand/.test(P.text('#outNote')), 'picked by hand says so');
}

console.log(failures.length ? `\n${failures.length} of ${checks} checks FAILED` : `\nall ${checks} checks passed`);
process.exit(failures.length ? 1 : 0);
