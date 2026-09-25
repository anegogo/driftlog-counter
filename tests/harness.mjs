// Loads the page's own scripts (/kit.js, then the inline <script> of index.html) into a VM with a stubbed DOM.
// No browser and no dependencies. Used by run.mjs (reading files) and share.mjs (result links and comparing).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>\n') + 9, html.lastIndexOf('</script>'));
export const kitSource = readFileSync(join(ROOT, 'kit.js'), 'utf8');

// Anything the page touches on an element or a canvas context: accept every call, remember what is set.
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

// hash: what location.hash is when the page loads. Returns the page's internals and what it did.
export function loadPage({ hash = '' } = {}) {
  const elements = new Map(), replaced = [];
  const document = {
    querySelector: sel => { if (!elements.has(sel)) elements.set(sel, stub()); return elements.get(sel); },
    getElementById: id => document.querySelector('#' + id),
    createElement: () => stub(),
    addEventListener() {},
    body: stub(),
    head: stub(),
    fonts: { load: () => Promise.resolve([]) },
    title: '',
  };
  const context = vm.createContext({
    document, console, setTimeout, clearTimeout, TextDecoder, DataView, Uint8Array, Float64Array,
    Map, Set, Promise, Math, JSON, Number, String, Array, Object, Error, RegExp, Date, Infinity, BigInt,
    File, Blob, isFinite, parseInt,
    navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false }),
    location: { hash, pathname: '/' },
    history: { replaceState: (s, t, url) => replaced.push(url) },
    addEventListener() {},
    fetch: async url => {
      const body = readFileSync(join(ROOT, String(url).replace(/^\.?\//, '')), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    },
  });
  context.window = context;
  vm.runInContext(kitSource, context, { filename: 'kit.js' });
  vm.runInContext(script + `
;globalThis.__t = { handle, showExample, prepareShare, codesOf, openShared, renderPicked, showCompare,
  get lastRun(){ return lastRun; }, get FEATS(){ return FEATS; }, get RECV(){ return RECV; }, get share(){ return share; },
  get MINE(){ return MINE; }, set MINE(v){ MINE = v; }, get cmpShare(){ return cmpShare; } };`,
  context, { filename: 'index.html' });
  const text = sel => { const v = elements.has(sel) ? elements.get(sel).textContent : undefined; return typeof v === 'string' ? v : ''; };
  return { T: context.__t, Kit: context.DriftlogKit, document, replaced, text, context };
}
