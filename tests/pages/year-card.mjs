// The English card (/2026/ on counter.getdriftlog.com) draws exactly what it drew on 2026-10-10, before /year.js
// learned a second language and a second kind of place. Every canvas call and property set of a card is written
// down and hashed; golden/card-en.json holds the hashes made with the /year.js of that day.
//   node tests/pages/year-card.mjs                        compare
//   node tests/pages/year-card.mjs --write [--site <dir>] write the hashes again (only when the English card is meant to
//                                                change), from another copy of the site if one is named
// The hashes in the file today were made from the /year.js of the morning of 2026-10-10 with one change, the site's
// address: that afternoon the counter moved from its pages.dev address to counter.getdriftlog.com, and the card
// prints its address.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, EN_SITE, site, checker, recorder } from './harness.mjs';

const GOLDEN = join(HERE, 'golden', 'card-en.json');
const WRITE = process.argv.includes('--write');
const { check, done } = checker();
const siteAt = process.argv.indexOf('--site');
const page = site(siteAt > 0 ? process.argv[siteAt + 1] : EN_SITE).loadPage('2026/index.html', ['kit.js', 'scan.js', 'year.js'],
  `{ showExample, ready, get state(){ return state; }, get FEATS(){ return FEATS; }, get locate(){ return locate; } }`);
const { DriftlogKit: Kit, DriftlogYear: Year } = page.context;
await page.T.showExample();
const F = page.T.FEATS, ex = page.T.state.view, at = (lon, lat) => page.T.locate(lon, lat);

const fr = Year.newTally();                     // an earlier year in Guiana, this year in Paris
Year.tallyAdd(fr, at(-52.33, 4.93), 2020, 1); Year.tallyAdd(fr, at(2.35, 48.86), 2026, 7);
const far = Year.newTally();                    // places outside the 194, and a year with one month
for (const [lon, lat, y, m] of [[114.17, 22.32, 2026, 12], [12.4534, 41.9029, 2026, 12], [12.50, 41.90, 2026, 12], [139.77, 35.68, 2019, 4]])
  Year.tallyAdd(far, at(lon, lat), y, m);

const SCENES = {
  'example': [ex, { src: 'example' }],
  'photos': [ex, { src: 'photos' }],
  'timeline': [ex, { src: 'timeline' }],
  'both': [ex, { src: 'both' }],
  'new switched off': [Object.assign({}, ex, { newCodes: null }), { src: 'photos' }],
  'all new': [Object.assign({}, ex, { newCodes: new Set(ex.codes) }), { src: 'photos' }],
  'edited': [Year.editView(ex, new Set([...ex.codes, 'DE', 'BR'].filter(c => c !== 'IS'))), { src: 'edited', base: 'both' }],
  'picked: 3': [Year.pickedView(2026, new Set(['JP', 'KR', 'IT'])), { src: 'tap' }],
  'picked: 1': [Year.pickedView(2026, new Set(['JP'])), { src: 'tap' }],
  'picked: 0': [Year.pickedView(2026, new Set()), { src: 'tap' }],
  'picked: 40': [Year.pickedView(2026, new Set(Kit.COUNTRIES.slice(0, 40).map(c => c.code))), { src: 'tap' }],
  'picked: 194': [Year.pickedView(2026, new Set(Kit.COUNTRIES.map(c => c.code))), { src: 'tap' }],
  'France': [Year.yearView(fr, F, 2026), { src: 'photos' }],
  'outside the 194': [Year.yearView(far, F, 2026), { src: 'photos' }],
  'another year': [Year.yearView(fr, F, 2020), { src: 'photos' }],
};
const now = {};
for (const [name, [view, opts]] of Object.entries(SCENES)) {
  const cv = recorder(), text = Year.drawYearCard(cv, F, view, opts);
  now[name] = { ops: cv.ops.length, hash: cv.hash(), text: JSON.stringify(text), share: Year.shareText(view), order: Year.orderOf(view).join(' ') };
}
if (WRITE) {
  mkdirSync(join(HERE, 'golden'), { recursive: true });
  writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n');
  console.log(`wrote ${Object.keys(now).length} cards to ${GOLDEN}`);
  process.exit(0);
}
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
check(Object.keys(golden).join('|') === Object.keys(now).join('|'), 'the same cards as the golden file');
for (const [name, g] of Object.entries(golden)) {
  const n = now[name] || {};
  check(n.text === g.text, `${name}: the words on the card\n  was ${g.text}\n  now ${n.text}`);
  check(n.hash === g.hash, `${name}: the drawing (${g.ops} operations then, ${n.ops} now)`);
  check(n.share === g.share && n.order === g.order, `${name}: the share line and the order of the list`);
}
console.log(`English card: ${Object.keys(golden).length} cards, ${Object.values(golden).reduce((s, g) => s + g.ops, 0).toLocaleString('en-US')} canvas operations compared`);
done();
