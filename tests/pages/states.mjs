// Tests for the US states: /us/states.js, the border file /us/us.json, the states page (/us/) and the line the
// counter's own page puts under a count from files. The pages' scripts run in a VM with a stubbed DOM (harness.mjs).
// No browser, no dependencies:  node tests/pages/states.mjs   (Node 20+)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, EN_SITE, checker, same, sorted, site, recorder, timeline, jpeg, sidecarFile } from './harness.mjs';

const { check, done } = checker();
const S = site(EN_SITE);
const LANDMARKS = JSON.parse(readFileSync(join(HERE, 'us-landmarks.json'), 'utf8'));
const usPage = () => S.loadPage('us/index.html', ['kit.js', 'scan.js', 'us/states.js'],
  `{ handle, showCount, openPicker, showExample, render, ready, place, openLink, shareText,
     get files(){ return files; }, get state(){ return state; }, get RECV(){ return RECV; }, get prepared(){ return prepared; },
     get FEATS(){ return FEATS; } }`);
const settle = () => new Promise(r => setTimeout(r, 5));      // the image is drawn a tick after the count is shown

const page = usPage();
const States = page.context.DriftlogStates, Kit = page.context.DriftlogKit;
await page.T.ready();

// ---------- 1. the table and the links ----------
{
  check(States.LIST.length === 51 && States.TOTAL === 50 && States.LIST[50].code === 'DC' && !States.LIST[50].state, 'fifty states, then the District');
  check(same(States.LIST.slice(0, 50).map(s => s.code), sorted(States.LIST.slice(0, 50).map(s => s.code))), 'the states are in the order of their codes');
  check(same(States.REGIONS.map(([r]) => States.LIST.filter(s => s.state && s.region === r).length), [9, 12, 16, 13]), 'the Census regions: 9, 12, 16 and 13 states');
  check(States.countOf(['NY', 'DC', 'XX', 'CA']) === 2 && States.nameOf('DC') === 'Washington, D.C.', 'the District is named but not counted');
  check(States.encodeMask([]) === '' && States.encodeMask(['AK']) === 'g' && States.encodeMask(States.LIST.map(s => s.code)).length === 9 && States.MASK_LEN === 9, 'the mask is nine characters at most');
  let ok = true;
  for (let k = 0; k < 300; k++) {
    const pick = new Set(States.LIST.filter((_, i) => (i * 7919 + k * 104729) % 5 < 2 + k % 3).map(s => s.code));
    const back = States.decodeMask(States.encodeMask(pick));
    if (!back || !same(sorted(back), sorted(pick))) ok = false;
  }
  check(ok, 'every list comes back from its mask');
  check(States.decodeMask('__________') === null && States.decodeMask('A!') === null && States.decodeMask('________B') === null, 'what is not a mask is refused (too long, other characters, bits past the last row)');
  const years = new Map([['CA', 2019], ['NY', 2015], ['DC', 2016]]);
  const hash = States.linkHash(['NY', 'CA', 'DC', 'ZZ'], { years, src: 'photos' });
  const link = States.readLink('#' + hash);
  check(/^s=1\.[A-Za-z0-9_-]+&y=[A-Za-z0-9_-]{3}&f=photos$/.test(hash), `a handed-over link: ${hash}`);
  check(same(sorted(link.codes), ['CA', 'DC', 'NY']) && link.years.get('NY') === 2015 && link.years.get('DC') === 2016 && link.src === 'photos' && link.base === null, 'and it reads back: states, first years, where they came from');
  const e = States.readLink('#' + States.linkHash(['TX'], { src: 'edited', base: 'both' }));
  check(e.src === 'edited' && e.base === 'both' && e.years === null, 'an edited list remembers what it was counted from');
  check(States.linkHash(['TX', 'OK']) === 's=1.' + States.encodeMask(['TX', 'OK']) && States.readLink('#' + States.linkHash(['TX', 'OK'])).src === null, 'a shared link carries the list and nothing else');
  check(States.resultUrl(['TX']) === 'https://counter.getdriftlog.com/us/#s=1.' + States.encodeMask(['TX']), `the address of a shared list: ${States.resultUrl(['TX'])}`);
  check(States.readLink('') === null && States.readLink('#app') === null && States.readLink('#v=1.AAAB') === null, 'other things after the # are not states links');
  check(States.readLink('#s=2.AAAB').error === 'version' && States.readLink('#s=1.!!!').error === 'broken' && States.readLink('#s=1.' + 'A'.repeat(300)).error === 'too-long', 'a states link that cannot be used says why');
  check(same(sorted(States.readLink('#s%3D1.' + States.encodeMask(['FL'])).codes), ['FL']), 'a link a mail wrapper escaped still reads');
}

// ---------- 2. the borders: every landmark in its state, and nothing abroad in any ----------
{
  const F = page.T.FEATS;
  check(F.length === 51 && F.every((f, i) => f.a === States.LIST[i].code) && F.filter(f => f.k).length === 50, '/us/us.json: the table\'s 51, in its order');
  const bytes = readFileSync(join(EN_SITE, 'us', 'us.json')).length;
  check(bytes > 150000 && bytes < 450000, `/us/us.json is ${bytes.toLocaleString('en-US')} bytes`);
  const wrong = [];
  for (const m of LANDMARKS) { const i = page.T.place(m.lon, m.lat), got = i >= 0 ? States.LIST[i].code : String(i); if (got !== m.state) wrong.push(`${m.name}: ${got}, not ${m.state}`); }
  check(wrong.length === 0, `${LANDMARKS.length} landmarks in their states${wrong.length ? ' — wrong: ' + wrong.join('; ') : ''}`);
  check(new Set(LANDMARKS.map(m => m.state)).size === 51, 'the landmarks cover every state and the District');
  // Across the border, a mile or less from a state: the nearest stretch of outline faces Canada or Mexico, and a
  // point is never moved across one.
  const abroad = [['Windsor, Ontario', 42.3149, -83.0364], ['Windsor riverfront', 42.3190, -83.0390], ['the Canadian half of the Detroit River', 42.3205, -83.0400],
    ['Niagara Falls, Ontario', 43.0896, -79.0849], ['Table Rock, Ontario', 43.0790, -79.0782], ['Tijuana', 32.5149, -117.0382], ['the arch in Tijuana', 32.5330, -117.0370],
    ['Ciudad Juárez', 31.6904, -106.4245], ['the centre of Juárez', 31.7386, -106.4870], ['Nogales, Sonora', 31.3050, -110.9440], ['Nuevo Laredo', 27.4779, -99.5496],
    ['Sault Ste. Marie, Ontario', 46.5136, -84.3358], ['Fort Frances, Ontario', 48.6100, -93.3960], ['Stanstead, Quebec', 45.0075, -72.0965], ['Campobello, New Brunswick', 44.8890, -66.9580],
    ['Vancouver, B.C.', 49.2827, -123.1207], ['Toronto', 43.6532, -79.3832], ['San Juan, Puerto Rico', 18.4655, -66.1057], ['Guam', 13.4443, 144.7937],
    ['the middle of the Pacific', 30, -150], ['Tokyo', 35.68, 139.77]];
  const inside = abroad.filter(([, lat, lon]) => page.T.place(lon, lat) !== -1).map(a => `${a[0]} (${States.LIST[page.T.place(a[2], a[1])].code})`);
  check(inside.length === 0, `towns across the border, the territories and the open sea are in no state${inside.length ? ' — but: ' + inside.join(', ') : ''}`);
  const home = [['the American half of the Detroit River', 42.3245, -83.0400, 'MI'], ['Prospect Point, Niagara Falls', 43.0862, -79.0692, 'NY'], ['downtown El Paso', 31.7587, -106.4869, 'TX'],
    ['the outlets at San Ysidro', 32.5435, -117.0300, 'CA'], ['Sault Ste. Marie, Michigan', 46.4953, -84.3453, 'MI'], ['Point Roberts', 48.9854, -123.0780, 'WA'], ['Lubec', 44.8606, -66.9842, 'ME'],
    ['Derby Line', 45.0048, -72.0990, 'VT'], ['Nogales, Arizona', 31.3404, -110.9343, 'AZ'], ['Laredo', 27.5036, -99.5076, 'TX'], ['International Falls', 48.6010, -93.4105, 'MN']];
  const lost = home.filter(([, lat, lon, st]) => { const i = page.T.place(lon, lat); return i < 0 || States.LIST[i].code !== st; }).map(a => a[0]);
  check(lost.length === 0, `and the American side of the same borders is in its state${lost.length ? ' — but not: ' + lost.join(', ') : ''}`);
  // Off a coast that faces no other country, a point goes to the nearest state.
  const stateOf = States.locator(F), code = (lon, lat) => { const v = stateOf(lon, lat); return v < 0 ? null : States.LIST[Math.floor(v / 10000)].code; };
  const piers = [['the end of Santa Monica Pier', 34.0083, -118.4987, 'CA'], ['the end of Navy Pier', 41.8917, -87.5990, 'IL'], ['the middle of the Golden Gate Bridge', 37.8199, -122.4783, 'CA'],
    ['the middle of the Mackinac Bridge', 45.8174, -84.7278, 'MI'], ['Lake Erie, two miles off Cleveland', 41.5300, -81.7000, 'OH']];
  const adrift = piers.filter(([, lat, lon, st]) => code(lon, lat) !== st).map(a => a[0]);
  check(adrift.length === 0, `a pier, a bridge, a boat off the coast: in the nearest state${adrift.length ? ' — but not: ' + adrift.join(', ') : ''}`);
  check(stateOf.inside(-81.7, 41.53) === -1 && stateOf.inside(-87.599, 41.8917) === -1, 'though outside every outline (the coast is where the land ends)');
  check(stateOf(-150, 30) === -1 && stateOf(200, 40) === -1 && stateOf(139.77, 35.68) === -1, 'a point far from every state is in none');
  check(F.filter(f => f.edge.some(e => e.includes(1))).map(f => f.a).join(' ') === 'AK AZ CA ID ME MI MN MT ND NH NM NY OH TX VT WA', `the states with a stretch of outline that faces Canada or Mexico: ${F.filter(f => f.edge.some(e => e.includes(1))).map(f => f.a).join(' ')}`);
}

// ---------- 3. the map ----------
{
  const F = page.T.FEATS, box = { x: 10, y: 330, w: 1180, h: 620 }, P = States.projection(box);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, outside = 0;
  F.forEach(f => {
    const part = P.of(f.a), [cx, cy, cw, ch] = part.clip;
    for (const poly of f.polys) for (const r of poly) for (let j = 0; j < r.length; j += 2) {
      const [x, y] = part.at(r[j], r[j + 1]);
      if (f.a === 'AK' && (x < cx || x > cx + cw || y < cy || y > cy + ch)) continue;      // the far Aleutians are cut off by Alaska's frame
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x < box.x - 1 || x > box.x + box.w + 1 || y < box.y - 1 || y > box.y + box.h + 1) outside++;
    }
  });
  check(outside === 0, `every state is drawn inside the map's box (${outside} points outside)`);
  check(x1 - x0 > box.w * 0.85 && y1 - y0 > box.h * 0.97, `and fills it: ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} of ${box.w} × ${box.h}`);
  const at = (code, lon, lat) => P.of(code).at(lon, lat);
  const [sx] = at('WA', -122.33, 47.61), [mx] = at('FL', -80.19, 25.76), [, ny] = at('ND', -100.78, 46.81), [, ty] = at('TX', -97.74, 30.27);
  check(sx < mx && ny < ty, 'Seattle is left of Miami and Bismarck above Austin');
  const [ax, ay] = at('AK', -149.9, 61.22), [hx, hy] = at('HI', -157.86, 21.31), [, ly] = at('CA', -118.24, 34.05), [tx] = at('TX', -97.74, 30.27);
  check(ay > ly && hy > ly && ax < hx && hx < tx, 'Alaska and Hawaii sit below California and left of Texas, Alaska first');
  const rec = recorder();
  States.drawUSA(rec.c, F, box, i => F[i].a === 'DC' || F[i].a === 'TX' ? Kit.COLORS.mine : null);
  check(rec.ops.filter(o => o.startsWith('arc(')).length === 2, 'a coloured District gets a dot (two circles), a coloured Texas does not');
}

// ---------- 4. the image ----------
{
  const F = page.T.FEATS;
  let rec = recorder(), text = States.drawStatesCard(rec, F, { codes: new Set(['NY', 'CA', 'DC']), src: 'photos' });
  check(text.kicker === 'I HAVE BEEN TO' && text.n === '2' && text.label === 'US states and Washington, D.C.' && text.caption === 'counted from my own photos, in my own browser' && text.url === 'getdriftlog.com/states', `a card from photos: ${JSON.stringify(text)}`);
  check(['I HAVE BEEN TO', '2', 'US states and Washington, D.C.', 'getdriftlog.com/states'].every(s => rec.drawn.some(d => d.s === s)), 'and all of it is on the image');
  text = States.drawStatesCard(recorder(), F, { codes: new Set(['TX']), src: 'tap' });
  check(text.n === '1' && text.label === 'US state' && text.caption === 'picked by hand', 'one state, picked by hand: no word about photos');
  text = States.drawStatesCard(recorder(), F, { codes: new Set(['TX', 'OK']), src: 'edited', base: 'timeline' });
  check(text.caption === 'counted from my own location history, then edited by hand', `an edited list: ${text.caption}`);
  text = States.drawStatesCard(recorder(), F, { codes: new Set(['TX']), src: 'example' });
  check(text.kicker === 'EXAMPLE · HAS BEEN TO' && text.caption === 'example data, not real photos', 'the example says it is one');
  check(States.chips(new Set(['NY', 'DC', 'AL']), new Map([['NY', 2015]])).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|') === '|Alabama|New York| |· 2015|Washington, D.C.|', 'chips: by name, the District last, a year where there is one');
}

// ---------- 5. the states page ----------
{
  const P = usPage(), T = P.T;
  let picker = null;
  P.context.DriftlogStates.picker = (host, o) => { picker = o; };
  // Photos from a trip: three states, the District, a town across the border, a photo abroad and one at sea.
  const trip = [jpeg('nyc.jpg', 40.7580, -73.9855, '2018:05:01 10:00:00'), jpeg('dc.jpg', 38.8895, -77.0353, '2018:05:03 10:00:00'), jpeg('dca.jpg', 38.8512, -77.0402, '2018:05:04 08:00:00'),
    jpeg('cincinnati.jpg', 39.1031, -84.5120, '2017:07:04 12:00:00'), jpeg('windsor.jpg', 42.3149, -83.0364, '2017:07:06 12:00:00'), jpeg('paris.jpg', 48.8584, 2.2945, '2024:09:12 12:00:00'),
    jpeg('pacific.jpg', 30, -150, '2020:01:01 00:00:00'), jpeg('nyc2.jpg', 40.7075, -74.0113, '2015:10:10 10:00:00')];
  await T.handle(trip); await settle();
  let st = T.state;
  check(st && same(sorted(st.codes), ['DC', 'NY', 'OH', 'VA']) && st.src === 'photos' && st.years.get('NY') === 2015 && st.years.get('OH') === 2017, `photos: ${st && sorted(st.codes)}`);
  check(P.text('#num') === '3' && P.text('#lbl') === 'states, found in your files' && /Washington, D\.C\. is on the map/.test(P.text('#also')), `the number is of states: ${P.text('#num')} ${P.text('#lbl')}`);
  check(T.files.stats.elsewhere === 3 && /^3 of the locations in those files are not in any state/.test(P.said('#abroad')), `not in a state: ${T.files.stats.elsewhere} (Windsor, Paris and the photo at sea)`);
  check(P.text('#status') === 'Done. Nothing left your browser.' && T.prepared.url === 'https://counter.getdriftlog.com/us/#' + States.linkHash(st.codes), 'the share link carries the list');
  check(T.prepared.text === 'I have been to 3 of 50 US states, counted from my own photos (nothing gets uploaded). Which have you been to?', T.prepared.text);
  await T.handle(trip, { adding: true });
  check(P.text('#status') === 'Those 8 files were counted already.', 'the same files twice');
  await T.handle([timeline([[36.1147, -115.1728, '2026-02-11'], [34.05, -118.24, '2026-08-29'], [40.7580, -73.9855, '2012-03-03']], 'Timeline.json'),
    sidecarFile('nyc.jpg', 40.7580, -73.9855, '2018-05-01T10:00:00Z'), sidecarFile('vegas.jpg', 36.1147, -115.1728, '2026-02-11T10:00:00Z')], { adding: true });
  await settle();
  st = T.state;
  check(same(sorted(st.codes), ['CA', 'DC', 'NV', 'NY', 'OH', 'VA']) && st.src === 'both' && st.years.get('NY') === 2012 && st.years.get('NV') === 2026, `a later batch adds to the count: ${sorted(st.codes)} from ${st.src}`);
  check(P.text('#status') === 'Added 3 files: 3 → 5 states. Nothing left your browser.' && T.files.stats.sidecars === 1, `"${P.text('#status')}", and a sidecar of a photo already counted is skipped (${T.files.stats.sidecars})`);

  T.openPicker(true);
  check(same(sorted(picker.initial), ['CA', 'DC', 'NV', 'NY', 'OH', 'VA']) && picker.doneLabel === 'Update the map', 'Edit opens the picker on the list');
  await picker.onDone(new Set(['CA', 'NV', 'NY', 'TX'])); await settle();
  st = T.state;
  check(same(sorted(st.codes), ['CA', 'NV', 'NY', 'TX']) && st.src === 'edited' && st.base === 'both' && st.years.get('NY') === 2012 && !st.years.has('TX') && T.files === null, `edited: ${sorted(st.codes)} ${st.src}/${st.base}`);
  check(P.text('#lbl') === 'states, from your files, edited by hand' && T.prepared.text === 'I have been to 4 of 50 US states. Which have you been to?', 'an edited list no longer says "counted from"');
  T.openPicker(false);
  await picker.onDone(new Set(['HI'])); await settle();
  st = T.state;
  check(st.src === 'tap' && st.years === null && P.text('#num') === '1' && P.text('#lbl') === 'state, picked by hand' && P.text('#stats') === 'Picked by hand from the fifty states.', 'picked from scratch');

  await T.handle([jpeg('paris.jpg', 48.8584, 2.2945, '2024:09:12 12:00:00')]);
  check(T.state === null && /none of them is in a US state/.test(P.said('#status')), `files with nothing in the States: "${P.said('#status').replace(/<[^>]+>/g, '')}"`);
  await T.showExample(); await settle();
  st = T.state;
  check(st.example && States.countOf(st.codes) === 15 && st.codes.has('DC') && T.prepared.url === 'https://counter.getdriftlog.com/us/' && P.text('#num') === '15', `the example: ${States.countOf(st.codes)} states and the District`);

  // A list handed over by the counter (f= says where it came from) is the visitor's own; a bare list is someone else's.
  const Q = usPage();
  await Q.T.openLink(States.readLink('#' + States.linkHash(['NY', 'CA', 'DC'], { years: new Map([['NY', 2015]]), src: 'timeline' }))); await settle();
  check(Q.T.RECV === null && Q.T.state && Q.T.state.src === 'timeline' && Q.T.state.years.get('NY') === 2015 && Q.text('#num') === '2', 'handed over by the counter: the result, as counted');
  check(Q.T.prepared.text === 'I have been to 2 of 50 US states, counted from my own Google Maps Timeline (nothing gets uploaded). Which have you been to?', Q.T.prepared.text);
  const R = usPage();
  await R.T.openLink(States.readLink('#' + States.linkHash(['NY', 'CA', 'TX'])));
  check(R.T.RECV && R.T.state === null && R.text('#recvTitle') === '3 of 50 states' && /California/.test(R.said('#recvList')), 'a link from someone else: their map, and nothing of the visitor\'s yet');
  check(same(page.fetched, ['/us/us.json']) && same(P.fetched, ['/us/us.json']), `the page asks for one fixed file and nothing else: ${P.fetched}`);
}

// ---------- 6. the line under the counter's own result ----------
{
  const C = S.loadPage('index.html', ['kit.js', 'video.js', 'us/states.js'], `{ handle, showExample, renderPicked, get lastRun(){ return lastRun; }, get FEATS(){ return FEATS; } }`);
  const countries = run => sorted(new Set([...run.agg.keys()].map(fi => C.T.FEATS[fi].n)));
  await C.T.handle([jpeg('nyc.jpg', 40.7580, -73.9855, '2018:05:01 10:00:00'), jpeg('dc.jpg', 38.8895, -77.0353, '2018:05:03 10:00:00'), jpeg('windsor.jpg', 42.3149, -83.0364, '2017:07:06 12:00:00'),
    jpeg('paris.jpg', 48.8584, 2.2945, '2024:09:12 12:00:00'), timeline([[36.1147, -115.1728, '2026-02-11'], [39.1031, -84.5120, '2010-07-04']], 'Timeline.json')]);
  const run = C.T.lastRun;
  check(same(countries(run), ['Canada', 'France', 'United States']) && run.us && same(sorted(run.usCodes), ['DC', 'NV', 'NY', 'OH']), `the counter still counts countries (${countries(run)}) and notes the states: ${run.usCodes && sorted(run.usCodes)}`);
  check(C.text('#usText') === 'In the United States, your files were in 3 of the 50 states, and in Washington, D.C.' && C.el('#usRow').hidden === false, `"${C.text('#usText')}"`);
  const link = States.readLink(String(C.el('#usLink').href).replace(/^\/us\//, ''));
  check(link && same(sorted(link.codes), ['DC', 'NV', 'NY', 'OH']) && link.src === 'both' && link.years.get('OH') === 2010 && link.years.get('NY') === 2018, `the link hands them to /us/: ${C.el('#usLink').href}`);
  await C.T.handle([jpeg('la.jpg', 34.05, -118.24, '2026:08:29 10:00:00')], { adding: true });
  check(C.text('#usText') === 'In the United States, your files were in 4 of the 50 states, and in Washington, D.C.', 'a later batch adds its states');
  await C.T.renderPicked(new Set(['US', 'FR']), 'tap');
  check(C.el('#usRow').hidden === false && C.text('#usLink') === 'Pick my US states' && C.el('#usLink').href === '/us/', 'a list picked by hand with the United States on it: the way to pick states');
  await C.T.renderPicked(new Set(['FR']), 'tap');
  check(C.el('#usRow').hidden === true, 'and none without it');
  await C.T.showExample();
  check(C.el('#usRow').hidden === true, 'the example gets no states line');
  check(same(sorted(new Set(C.fetched)), ['/countries50.json', '/us/us.json']), `the counter asks for the same two files whatever is dropped: ${sorted(new Set(C.fetched))}`);
  const D = S.loadPage('index.html', ['kit.js', 'video.js', 'us/states.js'], `{ handle, get lastRun(){ return lastRun; }, get FEATS(){ return FEATS; } }`);
  await D.T.handle([jpeg('paris.jpg', 48.8584, 2.2945, '2024:09:12 12:00:00')]);
  check(D.el('#usRow').hidden === true && D.T.lastRun.us.size === 0 && D.fetched.includes('/us/us.json'), 'files with nothing in the United States: no line, and the states file was asked for all the same');
  // Along the border the state lines settle the country too: the country borders (1:50m) put downtown El Paso
  // in Mexico and the American side of the falls in Canada.
  const names = run => sorted(new Set([...run.agg.keys()].map(fi => D.T.FEATS[fi].n)));
  await D.T.handle([jpeg('elpaso.jpg', 31.7587, -106.4869, '2022:03:03 10:00:00'), jpeg('prospect-point.jpg', 43.0862, -79.0692, '2023:06:06 10:00:00')]);
  check(same(names(D.T.lastRun), ['United States']) && same(sorted(D.T.lastRun.usCodes), ['NY', 'TX']), `downtown El Paso and Prospect Point are in the United States: ${names(D.T.lastRun)} / ${sorted(D.T.lastRun.usCodes || [])}`);
  await D.T.handle([jpeg('tijuana.jpg', 32.5330, -117.0370, '2022:03:04 10:00:00'), jpeg('table-rock.jpg', 43.0790, -79.0782, '2023:06:06 12:00:00'), jpeg('pier.jpg', 34.0083, -118.4987, '2021:01:01 10:00:00')]);
  check(same(names(D.T.lastRun), ['Canada', 'Mexico', 'United States']) && same(sorted(D.T.lastRun.usCodes), ['CA']), `Tijuana and the Canadian side of the falls are not, and the end of a pier is in its state: ${names(D.T.lastRun)} / ${sorted(D.T.lastRun.usCodes || [])}`);
  // Without /us/states.js the counter is what it was: the country borders alone decide.
  const E = S.loadPage('index.html', ['kit.js', 'video.js'], `{ handle, get lastRun(){ return lastRun; }, get FEATS(){ return FEATS; } }`);
  await E.T.handle([jpeg('nyc.jpg', 40.7580, -73.9855, '2018:05:01 10:00:00')]);
  check(E.T.lastRun.us.size === 0 && E.el('#usRow').hidden === true && !E.fetched.includes('/us/us.json'), 'the counter without the states script counts as before');
}

// ---------- 7. the year card of states (/us/2026/, built from the English year page) ----------
{
  const yearPage = () => S.loadPage('us/2026/index.html', ['kit.js', 'scan.js', 'year.js', 'us/states.js'],
    `{ handle, showCount, openPicker, showExample, ready, get files(){ return files; }, get state(){ return state; }, get prepared(){ return prepared; }, get FEATS(){ return FEATS; } }`);
  const Y = yearPage(), Year = Y.context.DriftlogYear;
  let picker = null;
  Y.context.DriftlogStates.picker = (host, o) => { picker = o; };
  await Y.T.showExample(); await settle();
  let v = Y.T.state.view;
  check(Y.T.state.example && same(sorted(v.codes), ['AZ', 'CA', 'LA', 'NV', 'NY', 'OR', 'TX', 'WA']) && same(sorted(v.newCodes), ['AZ', 'LA', 'NV', 'TX']) && Year.totalOf(v) === 12, `the example: ${sorted(v.codes)}, new ${sorted(v.newCodes)}, so far ${Year.totalOf(v)}`);
  check(same(v.others, ['Washington, D.C.']) && /^Also in 2026: Washington, D\.C\. — on the map, but not in the number/.test(Y.text('#also')), `the District is on the map and named, not counted: "${Y.text('#also')}"`);
  check(Y.text('#outTitle') === 'An example: 8 states in 2026', Y.text('#outTitle'));
  const rec = recorder(), text = Year.drawYearCard(rec, Y.T.FEATS, v, { src: 'photos' });
  check(text.count === '8 states' && text.sub === '4 new to me · 12 so far' && text.url === 'getdriftlog.com/2026' && same(text.groups.map(g => g.label), ['NEW TO ME', 'BEEN BEFORE']), `the card: ${text.count} / ${text.sub} / ${text.url}`);
  check(same(text.groups[0].names, ['Arizona', 'Nevada', 'Louisiana', 'Texas']) && text.groups[1].names.includes('New York') && !rec.drawn.some(d => /[\u{1F1E6}-\u{1F1FF}]/u.test(d.s)), 'names without flags, in the order of the year');
  check(Year.shareText(v) === 'My 2026 in travel: 8 states, 4 of them new to me. Make yours:', Year.shareText(v));
  await Y.T.handle([jpeg('seattle-2019.jpg', 47.6097, -122.3422, '2019:06:01 10:00:00'), jpeg('seattle.jpg', 47.6097, -122.3422, '2026:01:05 10:00:00'), jpeg('vegas.jpg', 36.1147, -115.1728, '2026:02:11 10:00:00'),
    jpeg('dc.jpg', 38.8895, -77.0353, '2026:05:03 10:00:00'), jpeg('windsor.jpg', 42.3149, -83.0364, '2026:07:06 12:00:00'), jpeg('paris.jpg', 48.8584, 2.2945, '2026:09:12 12:00:00')]);
  await settle();
  v = Y.T.state.view;
  check(same(sorted(v.codes), ['NV', 'WA']) && same(sorted(v.newCodes), ['NV']) && same(v.others, ['Washington, D.C.']) && Y.text('#outTitle') === '2 states in 2026', `photos: ${sorted(v.codes)}, new ${sorted(v.newCodes)}; Windsor and Paris are in no state`);
  check(Y.T.prepared.url === 'https://counter.getdriftlog.com/us/2026/' && Y.T.prepared.text === 'My 2026 in travel: 2 states, 1 of them new to me. Make yours:', `shared: ${Y.T.prepared.text} ${Y.T.prepared.url}`);
  Y.T.openPicker(true);
  check(picker.district === false && picker.title === 'Which states did you go to in 2026?' && same(sorted(picker.initial), ['NV', 'WA']), 'the picker offers the fifty states and not the District');
  check(same(Y.fetched, ['/us/us.json']), `the page asks for one fixed file: ${Y.fetched}`);
  check(!/countries|country/.test(Y.html.replace(/<script>[\s\S]*$/, '').replace(/href="[^"]*"|Count countries instead|Your 2026 in countries|Count your countries from photos|your home country/g, '')), 'the page speaks of states, not countries');
}

done();
