// Runs the page's own scripts against tests/fixtures with a stubbed DOM (tests/harness.mjs), and checks
// which countries it finds. No browser and no dependencies: `node tests/run.mjs` (Node 20+).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadPage } from './harness.mjs';

const walk = dir => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [new File([readFileSync(p)], n)];
});
const { T } = loadPage();
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

// 4. Adding to the count on screen (the photo buttons, a drop and "Add more photos" pass adding: true): batches add
// up, a file already read is skipped, and after nothing, the example or a list picked by hand it starts afresh.
{
  const { T: P, text, document } = loadPage();
  const trip = n => new File([readFileSync(join(ROOT, 'tests', 'fixtures', 'trip', n))], n);
  const names = () => [...P.lastRun.agg].filter(([fi]) => P.FEATS[fi].k).map(([fi]) => P.FEATS[fi].n).sort();
  const addBtn = () => document.querySelector('#addMore').hidden;
  await P.handle([trip('rome.jpg'), trip('malta.jpg')], { adding: true });
  check(same(names(), ['Italy', 'Malta']) && P.lastRun.n === 2 && addBtn() === false, `adding with nothing on screen starts a count: ${names().join(', ')}`);
  await P.handle([trip('singapore.jpg'), trip('newyork.jpg'), trip('rome.jpg')], { adding: true });
  check(same(names(), ['Italy', 'Malta', 'Singapore', 'United States']) && P.lastRun.n === 4, `a second batch adds: ${names().join(', ')}`);
  check(P.lastRun.stats.media === 4 && P.lastRun.stats.withLoc === 4 && P.lastRun.agg.get([...P.lastRun.agg.keys()].find(fi => P.FEATS[fi].n === 'Italy')).photos === 1,
    `the photo already read is skipped: ${JSON.stringify(P.lastRun.stats)}`);
  check(text('#status') === 'Added 2 files: 2 → 4 countries. Nothing left your browser.', `status: ${text('#status')}`);
  await P.handle([trip('singapore.jpg')], { adding: true });
  check(P.lastRun.n === 4 && text('#status') === 'That file was counted already.', `the same file again: ${text('#status')}`);
  await P.handle([trip('nogps.jpg')], { adding: true });
  check(P.lastRun.n === 4 && P.lastRun.stats.media === 5 && text('#status') === 'That file had no location, so the map is as it was.', `a file with no location: ${text('#status')}`);
  await P.handle([trip('vatican.jpg'), trip('hongkong.jpg')], { adding: true });
  check(P.lastRun.n === 4 && text('#status') === 'Added 2 files, but no new countries: still 4.', `places outside the 194: ${text('#status')}`);
  await P.handle([new File([readFileSync(join(ROOT, 'tests', 'fixtures', 'Timeline.json'))], 'Timeline.json')], { adding: true });
  check(P.lastRun.n === 6 && P.lastRun.src === 'both' && P.lastRun.stats.points > 0 && names().includes('Mexico'), `a Timeline file adds too: ${P.lastRun.n}, ${P.lastRun.src}`);
  await P.handle([trip('malta.jpg')]);
  check(same(names(), ['Malta']), `without adding it starts afresh: ${names().join(', ')}`);
  await P.showExample();
  check(addBtn() === true, 'the example has no "Add more photos"');
  await P.handle([trip('malta.jpg')], { adding: true });
  check(same(names(), ['Malta']) && P.lastRun.n === 1, `after the example it starts afresh: ${names().join(', ')}`);
  await P.renderPicked(new Set(['JP', 'FR']), 'tap');
  check(addBtn() === true, 'a list picked by hand has no "Add more photos"');
  await P.handle([trip('malta.jpg')], { adding: true });
  check(same(names(), ['Malta']) && P.lastRun.n === 1, `after a list picked by hand it starts afresh: ${names().join(', ')}`);
  const empty = loadPage();
  await empty.T.handle([trip('nogps.jpg')], { adding: true });
  await empty.T.handle([trip('malta.jpg')], { adding: true });
  check(empty.T.lastRun.n === 1 && empty.text('#status') === 'Done. Nothing left your browser.', `after a batch with no locations it starts afresh: ${empty.text('#status')}`);
}

if (failures.length){ console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('PASS');
process.exit(0);
