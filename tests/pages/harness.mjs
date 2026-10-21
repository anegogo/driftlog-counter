// What the page tests share (states.mjs, year-card.mjs, year-pref.mjs): a page's scripts loaded into a VM
// with a stubbed DOM, the way year.mjs does it, plus a canvas context that writes down everything drawn on it.
// No browser, no dependencies (Node 20+). year.mjs keeps its own copy of the loader and is left as it was.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const EN_SITE = join(HERE, '..', '..');                                 // the repository: counter.getdriftlog.com
export const FIXTURES = join(HERE, '..', 'fixtures');

export function checker() {
  const failures = [];
  let checks = 0;
  const check = (cond, msg) => { checks++; if (!cond) { failures.push(msg); console.log('FAIL ' + msg); } };
  const done = () => {
    console.log(failures.length ? `\n${failures.length} of ${checks} checks FAILED` : `\nall ${checks} checks passed`);
    process.exit(failures.length ? 1 : 0);
  };
  return { check, done };
}
export const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const sorted = it => [...it].sort();

// Anything a page touches on an element or a canvas context: accept every call, remember what is set.
export const stub = () => new Proxy(function () {}, {
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
  set(t, k, v) { t[k] = v; if (k === 'textContent' || k === 'innerHTML') t.said = v; return true; },
  apply() { return stub(); },
});

// A site (a folder of the site) and its pages. loadPage(htmlRel, scripts, expose): the scripts the page names, then
// its last inline <script>, with `expose` appended so a test can reach the page's own functions and state.
// fetched: every address the page asked for, as the browser would resolve it against the page's own.
export function site(SITE) {
  const read = (...p) => readFileSync(join(SITE, ...p), 'utf8');
  function loadPage(htmlRel, scripts, expose) {
    const html = read(htmlRel);
    const script = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('</script>'));
    const elements = new Map(), fetched = [];
    const base = 'https://site.test/' + htmlRel.replace(/index\.html$/, '');
    const document = {
      querySelector: sel => { if (!elements.has(sel)) elements.set(sel, stub()); return elements.get(sel); },
      getElementById: id => document.querySelector('#' + id),
      createElement: () => stub(),
      addEventListener() {},
      body: stub(), head: stub(),
      documentElement: { lang: (/<html lang="([^"]+)"/.exec(html) || [])[1] || '' },
      fonts: { load: () => Promise.resolve([]) },
      title: '',
    };
    const context = vm.createContext({
      document, console, setTimeout, clearTimeout, TextDecoder, DataView, Uint8Array, Float64Array, URL,
      Map, Set, Promise, Math, JSON, Number, String, Array, Object, Error, RegExp, Date, Infinity, BigInt,
      File, Blob, isFinite, parseInt,
      navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false }),
      location: { hash: '', pathname: '/' + htmlRel.replace(/index\.html$/, '') },
      history: { replaceState() {} },
      addEventListener() {},
      fetch: async url => {
        const u = new URL(String(url), base);
        fetched.push(u.origin === 'https://site.test' ? u.pathname : u.href);
        const body = read(u.pathname.replace(/^\//, ''));
        return { ok: true, status: 200, json: async () => JSON.parse(body) };
      },
    });
    context.window = context;
    for (const s of scripts) vm.runInContext(read(s), context, { filename: s });
    vm.runInContext(script + '\n;globalThis.__t = ' + expose + ';', context, { filename: htmlRel });
    const text = sel => { const v = elements.has(sel) ? elements.get(sel).textContent : undefined; return typeof v === 'string' ? v : ''; };
    // said: what the page last put in an element, as text or as HTML (a status line with a link in it is HTML).
    const said = sel => { const v = elements.has(sel) ? elements.get(sel).said : undefined; return typeof v === 'string' ? v : ''; };
    return { T: context.__t, context, text, said, el: sel => document.querySelector(sel), html, script, fetched };
  }
  return { SITE, read, loadPage };
}
export const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [new File([readFileSync(p)], n)];
});

// A canvas whose context measures text roughly (0.55 em a character, as year.mjs does; a full em for kana, kanji
// and full-width punctuation, or forty-seven prefectures would seem to fit where they do not) and writes down every call
// and every property set, in order. ops: the whole drawing, one line an operation (measuring is not drawing and is
// left out). drawn: each fillText with the font, colour and letter-spacing it was drawn in.
export function recorder() {
  const ops = [], drawn = [];
  const num = a => typeof a === 'number' ? String(Math.round(a * 1000) / 1000) : typeof a === 'string' ? JSON.stringify(a) : String(a);
  const c = new Proxy({ font: '10px x' }, {
    has: () => true,
    get(t, k) {
      if (k === 'measureText') return s => ({ width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55), 0) * +/(\d+(?:\.\d+)?)px/.exec(t.font)[1] });
      if (k in t) return t[k];
      return (...args) => {
        ops.push(`${String(k)}(${args.map(num).join(',')})`);
        if (k === 'fillText') drawn.push({ s: args[0], x: args[1], y: args[2], font: t.font, fill: t.fillStyle, spacing: t.letterSpacing });
      };
    },
    set(t, k, v) { t[k] = v; ops.push(`${String(k)}=${num(v)}`); return true; },
  });
  return { getContext: () => c, c, ops, drawn, hash: () => createHash('sha256').update(ops.join('\n')).digest('hex') };
}

// A Google Maps Timeline export (the on-device format): [[lat, lon, 'YYYY-MM-DD'], …].
export const timeline = (recs, name) => new File([JSON.stringify({ semanticSegments: recs.map(([lat, lon, date]) => ({
  startTime: date + 'T10:00:00.000Z', endTime: date + 'T12:00:00.000Z',
  visit: { topCandidate: { placeLocation: { latLng: `${lat}°, ${lon}°` } } } })) })], name || `Timeline-${recs.length}-${recs[0][2]}.json`);

// A JPEG that is nothing but its EXIF: a location and a date, as a phone writes them (big-endian TIFF).
export function jpeg(name, lat, lon, date) {
  const rat = v => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 1000); return [d, 1, m, 1, s, 1000]; };
  const dateStr = date + '\0';                                         // "2026:03:14 09:26:53"
  const tiff = new DataView(new ArrayBuffer(512));
  let o = 0;
  const u16 = v => { tiff.setUint16(o, v); o += 2; }, u32 = v => { tiff.setUint32(o, v); o += 4; };
  const entry = (tag, type, count, value) => { u16(tag); u16(type); u32(count); if (typeof value === 'string') { for (let i = 0; i < 4; i++) tiff.setUint8(o + i, i < value.length ? value.charCodeAt(i) : 0); o += 4; } else u32(value); };
  u16(0x4D4D); u16(42); u32(8);
  const EXIF_AT = 8 + 2 + 2 * 12 + 4, GPS_AT = EXIF_AT + 2 + 12 + 4, DATA_AT = GPS_AT + 2 + 4 * 12 + 4;
  u16(2); entry(0x8769, 4, 1, EXIF_AT); entry(0x8825, 4, 1, GPS_AT); u32(0);
  u16(1); entry(0x9003, 2, dateStr.length, DATA_AT); u32(0);
  u16(4); entry(1, 2, 2, lat < 0 ? 'S\0' : 'N\0'); entry(2, 5, 3, DATA_AT + 24); entry(3, 2, 2, lon < 0 ? 'W\0' : 'E\0'); entry(4, 5, 3, DATA_AT + 48); u32(0);
  [...dateStr].forEach((ch, i) => tiff.setUint8(DATA_AT + i, ch.charCodeAt(0)));
  rat(lat).forEach((v, i) => tiff.setUint32(DATA_AT + 24 + i * 4, v));
  rat(lon).forEach((v, i) => tiff.setUint32(DATA_AT + 48 + i * 4, v));
  const body = new Uint8Array(tiff.buffer, 0, DATA_AT + 72);
  const head = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, (body.length + 8) >> 8, (body.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  return new File([head, body, new Uint8Array([0xFF, 0xD9])], name);
}
// A Google Photos sidecar (the JSON beside a photo in a Takeout export).
export const sidecarFile = (title, lat, lon, date) => new File([JSON.stringify({ title, photoTakenTime: { timestamp: String(Date.parse(date) / 1000) },
  geoData: { latitude: lat, longitude: lon, altitude: 0 } })], title + '.supplemental-metadata.json');
