// Result links, the country table and comparing two lists: /kit.js on its own, then the page opened from a link,
// and the counter's links to the passport page.
// Same stubbed DOM as run.mjs (tests/harness.mjs). `node tests/share.mjs` (Node 20+).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadPage } from './harness.mjs';

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
let seed = 20260924;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const { Kit } = loadPage();
const ALL = Kit.COUNTRIES.map(c => c.code);
const pick = (n, from = ALL) => { const a = from.slice(); for (let i = a.length - 1; i > 0; i--){ const j = (rand() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return new Set(a.slice(0, n)); };

// 1. The table is exactly the 194 counted countries of the border file, in code order: the order of link version 1.
const feats = JSON.parse(readFileSync(join(ROOT, 'countries50.json'), 'utf8'));
const counted = new Map();
for (const f of feats) if (f.k && !counted.has(f.a)) counted.set(f.a, f.n);
check(ALL.length === 194 && Kit.MASK_LEN === 33, `194 countries in 33 characters: ${ALL.length}, ${Kit.MASK_LEN}`);
check(ALL.join() === [...counted.keys()].sort().join(), 'table codes = counted codes in countries50.json, sorted');
check(Kit.COUNTRIES.every(c => counted.get(c.code) === c.name), 'table names = border file names');
check(Kit.COUNTRIES.every(c => /^[EANSFO]{1,2}$/.test(c.regions)), 'every country has a region');
check(Kit.COUNTRIES.filter(c => c.code === 'TW').length === 1 && !Kit.COUNTRIES.some(c => ['HK', 'XK', 'VA', 'PS', 'PR'].includes(c.code)), 'Taiwan in; Hong Kong, Kosovo, Vatican City, Palestine, Puerto Rico out');
// Pin link version 1: these must never change, or links already shared would show the wrong countries.
check(Kit.linkHash(['AD']) === 'v=1.g' && Kit.linkHash(['ZW']) === 'v=1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQ' && Kit.linkHash(['JP', 'FR']) === 'v=1.AAAAAAAAACAAAAQ',
  `version 1 bit order: ${Kit.linkHash(['AD'])} ${Kit.linkHash(['ZW'])} ${Kit.linkHash(['JP', 'FR'])}`);

// 2. Round trips: none, all 194, and random lists, with and without first-visit years.
const round = (codes, years) => Kit.readLink('#' + Kit.linkHash(codes, years));
let r = round([]);
check(Kit.linkHash([]) === 'v=1.' && r && r.codes.size === 0 && r.years === null, 'no countries: "v=1." and back');
r = round(ALL);
check(r && sameSet(r.codes, new Set(ALL)), 'all 194 and back');
check(Kit.resultUrl(ALL) === 'https://driftlog-counter.pages.dev/c/194/#v=1.________________________________w', `all 194 link: ${Kit.resultUrl(ALL)}`);
check(Kit.resultUrl([]) === 'https://driftlog-counter.pages.dev/c/0/#v=1.', 'no-country link');
let bad = 0, longest = 0;
for (let t = 0; t < 3000; t++){
  const codes = pick((rand() * 195) | 0);
  const years = t % 3 ? null : new Map([...codes].map(c => [c, rand() < 0.2 ? null : 1976 + ((rand() * 63) | 0)]));
  const url = Kit.resultUrl(codes, years);
  longest = Math.max(longest, url.length);
  const back = Kit.readLink(url.slice(url.indexOf('#')));
  const n = +url.match(/\/c\/(\d+)\//)[1];
  const yearsOk = !years || [...codes].every(c => (years.get(c) || undefined) === (back.years ? back.years.get(c) : undefined));
  if (!back || !back.codes || !sameSet(back.codes, codes) || n !== codes.size || !yearsOk) bad++;
}
check(bad === 0, `random round trips failed: ${bad} of 3000`);
check(longest <= 46 + 33 + 3 + 194, `longest link: ${longest} characters`);
console.log(`round trips: 3000 random lists, longest link ${longest} characters (years included in a third)`);
const years = new Map([['JP', 2014], ['FR', 1970], ['PE', 2039]]);
r = round(['JP', 'FR', 'PE'], years);
check(r.years && r.years.get('JP') === 2014 && !r.years.has('FR') && !r.years.has('PE'), 'years outside 1976–2038 are left out, not wrapped');
check(!Kit.linkHash(['JP'], new Map()).includes('&y='), 'no years, no y= part');

// 3. Links that are not ours, broken, too long or from a newer version: ignored, never thrown on.
const cases = [
  ['', null], ['#', null], ['#app', null], ['#vv=1.g', null], ['#version=1', null],
  ['#v=', 'broken'], ['#v=1', 'broken'], ['#v=abc', 'broken'], ['#v=1.!!', 'broken'], ['#v=1.g%20', 'broken'],
  ['#v=1.' + 'g'.repeat(34), 'broken'],                     // one character too many
  ['#v=1.' + 'A'.repeat(32) + 'B', 'broken'],               // a bit past the 194th country
  ['#v=2.g', 'version'], ['#v=10.g', 'version'], ['#v=01.g', 'version'],
  ['#v=1.g&x=' + 'a'.repeat(600), 'too-long'],
];
for (const [hash, want] of cases){
  let got;
  try { got = Kit.readLink(hash); } catch (e){ got = { error: 'threw ' + e.message }; }
  check(want === null ? got === null : got && got.error === want, `readLink(${JSON.stringify(hash.slice(0, 40))}): ${JSON.stringify(got)}, want ${want}`);
}
r = Kit.readLink('#v%3D1.gAAAAg');
check(r && r.codes && r.codes.size === 2 && r.codes.has('AD'), 'a # that came back percent-encoded (#v%3D1.…) still reads');
for (const hash of ['#v=1.g%ZZ', '#v=1.g%E0%A4%A']){
  let got; try { got = Kit.readLink(hash); } catch (e){ got = { error: 'threw ' + e.message }; }
  check(got && got.error === 'broken', `readLink(${hash}): ${JSON.stringify(got)}, want broken`);
}
r = Kit.readLink('#x=1&v=1.g&zz=2');
check(r && r.codes.has('AD') && r.codes.size === 1, 'v need not come first; unknown keys ignored');
r = Kit.readLink('#v=1.gAAAAg&y=Z!');
check(r && r.codes.size === 2 && r.years === null, 'broken years: countries kept, years dropped');
r = Kit.readLink('#v=1.gAAAAg&y=Z');
check(r && r.codes.size === 2 && r.years === null, 'years of the wrong length dropped');
check(Kit.readLink('#v=1.' + 'A'.repeat(32) + 'w').codes.size === 2, 'the last character may carry countries 193 and 194');

// 4. Comparing: both, only mine, only theirs.
let cmp = Kit.compare(['JP', 'FR', 'US', 'XX'], ['FR', 'US', 'PE', 'HK']);
check(cmp.both.join() === 'FR,US' && cmp.onlyMine.join() === 'JP' && cmp.onlyTheirs.join() === 'PE', `small compare: ${JSON.stringify(cmp)}`);
cmp = Kit.compare([], ALL);
check(cmp.both.length === 0 && cmp.onlyMine.length === 0 && cmp.onlyTheirs.length === 194, 'nothing against everything');
bad = 0;
for (let t = 0; t < 500; t++){
  const a = pick((rand() * 195) | 0), b = pick((rand() * 195) | 0), c = Kit.compare(a, b);
  const all = [...c.both, ...c.onlyMine, ...c.onlyTheirs];
  if (c.both.length + c.onlyMine.length !== a.size || c.both.length + c.onlyTheirs.length !== b.size
    || new Set(all).size !== all.length || !c.both.every(x => a.has(x) && b.has(x)) || !c.onlyMine.every(x => a.has(x) && !b.has(x))
    || !c.onlyTheirs.every(x => b.has(x) && !a.has(x)) || new Set(all).size !== new Set([...a, ...b]).size) bad++;
}
check(bad === 0, `random compares wrong: ${bad} of 500`);

// 5. Search and order for the picker, stamps and the video.
const first = q => Kit.search(q)[0];
check(first('japan') === 'JP' && first('uk') === 'GB' && first('USA') === 'US' && first('ivory') === 'CI' && first('turkey') === 'TR'
  && first('sao tome') === 'ST' && first('czech') === 'CZ' && first('holland') === 'NL' && first('fr') === 'FR', 'search finds common names');
check(Kit.search('hong kong').length === 0 && Kit.otherPlace('hong kong') === 'Hong Kong' && Kit.otherPlace('vatican') === 'Vatican City', 'places outside the 194 are explained, not offered');
check(Kit.revealOrder(['PE', 'JP', 'FR', 'DE'], new Map([['JP', 2014], ['PE', 2012]])).join() === 'PE,JP,FR,DE', 'reveal order: years, then region, then name');

// 6. The page opened from a result link.
const link37 = pick(37);
let page = loadPage({ hash: '#' + Kit.linkHash(link37) });
await new Promise(res => setTimeout(res, 50));
check(page.T.RECV && sameSet(page.T.RECV.codes, link37), 'a result link opens the shared list');
check(page.replaced[0] === `/c/37/#${Kit.linkHash(link37)}`, `address bar keeps the link: ${page.replaced[0]}`);
check(page.document.title.startsWith('37 of 194'), `title: ${page.document.title}`);
check(page.text('#recvNote').includes('Only the number, 37,') && page.text('#recvNote').includes('never send to any server'), 'the note says what the server saw');
for (const hash of ['#v=1.!!', '#v=9.g', '#v=1.g&x=' + 'a'.repeat(600)]){
  page = loadPage({ hash });
  check(!page.T.RECV && page.replaced.length === 0 && page.text('#status').includes('could not be read'), `bad link ${hash.slice(0, 12)}: plain page with a note`);
}
page = loadPage({ hash: '#app' });
check(!page.T.RECV && page.text('#status') === '', '#app: plain page, no note');

// 7. A real count shares a result link with exactly its countries; the example shares the page.
const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [new File([readFileSync(p)], n)]; });
page = loadPage();
await page.T.handle(walk(join(ROOT, 'tests', 'fixtures')));
const url = page.T.share.url, back = Kit.readLink(url.slice(url.indexOf('#')));
check(/^https:\/\/driftlog-counter\.pages\.dev\/c\/15\/#v=1\.[A-Za-z0-9_-]+$/.test(url), `fixture link: ${url}`);
check(back && sameSet(back.codes, page.T.lastRun.codes) && [...back.codes].sort().join() === 'CA,DZ,FR,IS,IT,JP,KR,MA,MC,MT,MX,PT,SG,US,AR'.split(',').sort().join(), 'the link holds the 15 counted countries, not Hong Kong or Vatican City');
check(!url.includes('&y='), 'years are not shared');
check(page.T.share.text.startsWith('I have been to 15 of 194 countries, counted from my own'), `share text: ${page.T.share.text}`);
const href = sel => { const v = page.document.querySelector(sel).href; return typeof v === 'string' ? v : '(not set)'; };
check(href('#appline a').includes('ct=en_share&'), `sender's App Store line is ct=en_share: ${href('#appline a')}`);
await page.T.showExample();
check(page.T.share.url === 'https://driftlog-counter.pages.dev/', 'the example shares the page, not a result link');

// 8. The receiving end: comparing by tap, by photos, and after editing; every App Store link is ct=en_share_recv.
const sleep = ms => new Promise(res => setTimeout(res, ms));
const theirs = pick(37);
page = loadPage({ hash: '#' + Kit.linkHash(theirs) });
await sleep(50);
const nums = () => ['#nBoth', '#nMine', '#nTheirs'].map(s => page.document.querySelector(s).textContent).join();
const want = mine => { const c = Kit.compare(mine, theirs); return [c.both.length, c.onlyMine.length, c.onlyTheirs.length].join(); };
const tapped = new Set([...pick(12, [...theirs]), ...pick(18, ALL.filter(c => !theirs.has(c)))]);
page.T.MINE = { codes: tapped, src: 'tap' };
await page.T.showCompare();
check(nums() === '12,18,25', `tapped 30 against their 37: ${nums()}`);
const sent = page.T.cmpShare.url, sentBack = Kit.readLink(sent.slice(sent.indexOf('#')));
check(sent.startsWith('https://driftlog-counter.pages.dev/c/30/#v=1.') && sentBack && sameSet(sentBack.codes, tapped), `send-back link is your own: ${sent}`);
check(page.T.cmpShare.text === 'Both of us: 12. Only me: 18. Only you: 25. My map, to compare back:', `send-back text: ${page.T.cmpShare.text}`);
check(href('#appLink').includes('ct=en_share_recv'), `receiver: the app section links with ct=en_share_recv: ${href('#appLink')}`);
await page.T.handle(walk(join(ROOT, 'tests', 'fixtures')));
await sleep(20);
const counted15 = page.T.lastRun.codes;
check(page.T.MINE && sameSet(page.T.MINE.codes, counted15) && page.T.MINE.src === 'both', 'receiver counting photos: the comparison uses the counted countries');
check(nums() === want(counted15), `receiver counting photos: ${nums()} = ${want(counted15)}`);
check(href('#appline a').includes('ct=en_share_recv'), `receiver's result line is ct=en_share_recv: ${href('#appline a')}`);
// Add one of their countries: "only them" loses one and "both" gains one, so the numbers themselves must move.
const edited = new Set([...counted15, [...theirs].find(c => !counted15.has(c))]);
await page.T.renderPicked(edited, 'edited');
await sleep(20);
check(page.T.MINE && sameSet(page.T.MINE.codes, edited) && page.T.MINE.src === 'edited' && nums() === want(edited) && want(edited) !== want(counted15),
  `editing the counted result updates the comparison: ${nums()} = ${want(edited)}`);

// 9. "Make my passport page": /passport/# + the list, its first years and where it came from (same tab, so none of
// it reaches a server). Not for the example. On the receiving end it carries your own list, never theirs.
const passOf = sel => { const h = href(sel); return h.startsWith('/passport/#') ? Kit.readPassport(h.slice(h.indexOf('#'))) : null; };
page = loadPage();
await page.T.handle(walk(join(ROOT, 'tests', 'fixtures')));
let pass = passOf('#passLink');
const firstYears = page.T.codesOf(page.T.lastRun.agg).years;
check(pass && sameSet(pass.codes, page.T.lastRun.codes) && pass.src === 'both' && pass.base === null, `photo count: passport link has the 15 and s=both: ${href('#passLink')}`);
check(pass && pass.years && firstYears.size === 15 && [...firstYears].every(([c, y]) => pass.years.get(c) === y), 'photo count: passport link has each country\'s first year');
check(page.document.querySelector('#passRow').hidden === false, 'photo count: the passport link is shown');
const fewer = new Set([...page.T.lastRun.codes].filter(c => c !== 'JP')), e = page.T.edited(page.T.lastRun, fewer);
check(e.src === 'edited' && e.base === 'both' && e.years.size === 14 && !e.years.has('JP'), `edited(): ${JSON.stringify({ src: e.src, base: e.base, years: e.years && e.years.size })}`);
await page.T.renderPicked(fewer, e.src, e);
pass = passOf('#passLink');
check(pass && pass.codes.size === 14 && pass.src === 'edited' && pass.base === 'both' && !!pass.years && pass.years.size === 14, `edited count: s=edited&b=both with 14 years: ${href('#passLink').slice(-12)}`);
const e2 = page.T.edited(page.T.lastRun, new Set([...fewer, 'NZ']));
check(e2.src === 'edited' && e2.base === 'both' && e2.years.size === 14 && !e2.years.has('NZ'), 'edited twice: still counted from both; the added country has no year');
await page.T.renderPicked(new Set(['JP', 'PE']), 'tap');
pass = passOf('#passLink');
check(pass && pass.codes.size === 2 && pass.src === 'tap' && pass.years === null && !href('#passLink').includes('&y='), `picked by hand: s=tap, no years: ${href('#passLink')}`);
await page.T.showExample();
check(page.document.querySelector('#passRow').hidden === true, 'the example: no passport link');
page = loadPage({ hash: '#' + Kit.linkHash(theirs) });
await sleep(50);
page.T.MINE = { codes: tapped, src: 'tap' };
await page.T.showCompare();
pass = passOf('#cmpPassport');
check(pass && sameSet(pass.codes, tapped) && pass.src === 'tap', 'receiver: "Make my passport page" carries your own tapped list');
await page.T.handle(walk(join(ROOT, 'tests', 'fixtures')));
await sleep(20);
pass = passOf('#cmpPassport');
check(pass && pass.codes.size === 15 && pass.src === 'both' && pass.years && pass.years.size === 15, 'receiver counting photos: the passport link carries your 15 with their years');

// 10. Where the countries came from, on the images (on canvases that record the text). An edited list says "photos"
// only if it was counted from photos: a Timeline count that is then edited says "location history", on the result
// image and on the comparison card alike.
function recorder(){
  const texts = [];
  const ctx = new Proxy({}, {
    get(t, k){
      if (k in t) return t[k];
      if (k === 'measureText') return s => ({ width: String(s).length * 12 });
      if (k === 'fillText') return s => { texts.push(String(s)); };
      return () => {};
    },
    set(t, k, v){ t[k] = v; return true; },
  });
  return { ctx, texts };
}
const fixture = (...p) => new File([readFileSync(join(ROOT, 'tests', 'fixtures', ...p))], p[p.length - 1]);
const captionOf = texts => texts.find(t => /^(My list: )?(counted|picked|example)/.test(t));
const onCanvas = (pg, sel) => { const rec = recorder(); pg.document.querySelector(sel).getContext = () => rec.ctx; return rec; };
for (const [files, src, counted, editedCap] of [
  [[fixture('Timeline.json')], 'timeline', 'counted from my own location history, in my own browser', 'counted from my own location history, then edited by hand'],
  [walk(join(ROOT, 'tests', 'fixtures', 'trip')), 'photos', 'counted from my own photos, in my own browser', 'counted from my own photos, then edited by hand'],
  [walk(join(ROOT, 'tests', 'fixtures')), 'both', 'counted from my own photos and location history, in my own browser', 'counted from my own photos and location history, then edited by hand'],
]){
  page = loadPage();
  const card = onCanvas(page, '#map');
  await page.T.handle(files);
  check(page.T.lastRun.src === src && captionOf(card.texts) === counted, `${src} count: the image says "${captionOf(card.texts)}"`);
  card.texts.length = 0;
  const more = new Set([...page.T.lastRun.codes, 'PE']), ed = page.T.edited(page.T.lastRun, more);
  await page.T.renderPicked(more, ed.src, ed);
  check(ed.src === 'edited' && ed.base === src && captionOf(card.texts) === editedCap, `${src} count, edited: the image says "${captionOf(card.texts)}"`);
  if (src === 'timeline') check(!card.texts.some(t => /photo/i.test(t)), `timeline count, edited: no "photos" anywhere on the image (${card.texts.join(' | ')})`);
  // The receiving end: the same list counted, then changed, on the comparison card.
  page = loadPage({ hash: '#' + Kit.linkHash(theirs) });
  await sleep(50);
  const cmpCard = onCanvas(page, '#cmpMap');
  await page.T.handle(files);
  await sleep(20);
  check(captionOf(cmpCard.texts) === 'My list: ' + counted, `receiver, ${src} count: the comparison card says "${captionOf(cmpCard.texts)}"`);
  cmpCard.texts.length = 0;
  page.T.MINE = page.T.edited(page.T.MINE, new Set([...page.T.MINE.codes, 'DE']));
  await page.T.showCompare(true);
  check(page.T.MINE.base === src && captionOf(cmpCard.texts) === 'My list: ' + editedCap, `receiver, ${src} count, changed: the comparison card says "${captionOf(cmpCard.texts)}"`);
  if (src === 'timeline') check(!cmpCard.texts.some(t => /photo/i.test(t)), `receiver, timeline count, changed: no "photos" on the comparison card (${cmpCard.texts.join(' | ')})`);
}
{
  page = loadPage({ hash: '#' + Kit.linkHash(theirs) });
  await sleep(50);
  const cmpCard = onCanvas(page, '#cmpMap');
  page.T.MINE = { codes: tapped, src: 'tap' };
  await page.T.showCompare(true);
  check(captionOf(cmpCard.texts) === 'My list: picked by hand · 194 = the 193 UN member states plus Taiwan', `receiver, tapped: "${captionOf(cmpCard.texts)}"`);
  check(typeof Kit.resultCaption === 'function' && Kit.resultCaption('edited') === 'counted from my own files, then edited by hand' && Kit.resultCaption('edited', 'tap') === Kit.resultCaption('edited'), 'edited, source unknown: "files", never "photos"');
}

// 11. Comparing with none of your own (nothing picked, or only Hong Kong): no passport page and no video, as under
// the result; sending back still works (/c/0/). With a country, both come back.
page = loadPage({ hash: '#' + Kit.linkHash(theirs) });
await sleep(50);
const shown = () => [page.document.querySelector('#cmpPassRow').hidden === true, page.document.querySelector('#cmpVid').hidden === true, !!page.T.cmpVideo.list].join();
page.T.MINE = { codes: new Set(), src: 'tap' };
await page.T.showCompare(true);
check(shown() === 'true,true,false' && page.T.cmpShare.url === 'https://driftlog-counter.pages.dev/c/0/#v=1.', `receiver, none picked: passport and video hidden (${shown()}), sends back /c/0/`);
page.T.MINE = { codes: new Set(['JP']), src: 'tap' };
await page.T.showCompare(true);
check(shown() === 'false,false,true', `receiver, one picked: passport and video shown (${shown()})`);
await page.T.handle([fixture('trip', 'hongkong.jpg')]);
await sleep(20);
check(page.T.MINE && page.T.MINE.codes.size === 0 && shown() === 'true,true,false', `receiver, Hong Kong only: passport and video hidden (${shown()})`);

// 12. The notes under both links say who can read the list: whoever gets the link, and the app it is sent with.
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check((html.match(/and the app you send it with, can read the list/g) || []).length === 2, 'both link notes name the app the link is sent with');
}

if (failures.length){ console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('PASS');
process.exit(0);
