// Tests for the Japanese page of trips at home, 国内旅行 (counter.getdriftlog.com/ja/2026/): /scan.js, /year.js,
// /ja/pref.js and the page's own inline script, in a VM with a stubbed DOM (harness.mjs). The same shape as year.mjs:
// first that the new readers find what the prefecture counter's own page (/ja/) finds, then months, one year, the
// card, the page. Trips abroad are the other card (海外旅行, on the Japanese counter); nothing abroad is counted here.
//   node tests/pages/year-pref.mjs        (Node 20+)
import { EN_SITE, FIXTURES, site, checker, same, sorted, walk, recorder, timeline, jpeg, sidecarFile } from './harness.mjs';

const { check, done } = checker();
const EN = site(EN_SITE);
const yearPage = () => EN.loadPage('ja/2026/index.html', ['kit.js', 'scan.js', 'year.js', 'ja/pref.js'],
  `{ handle, showCount, openPicker, showExample, render, ready, get files(){ return files; }, get state(){ return state; },
     get edits(){ return edits; }, get FEATS(){ return FEATS; }, get locate(){ return locate; } }`);
const counterPage = () => EN.loadPage('ja/index.html', [],
  `{ handle, prefIndex, loadPrefectures, loadCountries, get PREF(){ return PREF; }, get lastRun(){ return lastRun; } }`);

// ---------- 0. the 47 ----------
const page = yearPage();
const { DriftlogKit: Kit, DriftlogScan: Scan, DriftlogYear: Year, DriftlogPref: Pref } = page.context;
await page.T.ready();
const F = page.T.FEATS;
{
  const raw = JSON.parse(EN.read('ja/jp.json'));
  check(Pref.LIST.length === 47 && F.length === 47 && same(sorted(Pref.LIST.map(p => p.name)), sorted(raw.map(f => f.n))), 'the 47 of /ja/pref.js are the 47 of /ja/jp.json');
  check(Pref.LIST[0].code === '01' && Pref.LIST[0].name === '北海道' && Pref.LIST[12].name === '東京都' && Pref.LIST[46].code === '47' && Pref.LIST[46].name === '沖縄県', 'JIS order: 01 北海道, 13 東京都, 47 沖縄県');
  const covered = Pref.REGIONS.flatMap(([, from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i));
  check(same(covered, Array.from({ length: 47 }, (_, i) => i + 1)), 'the regions of the picker hold each prefecture once');
  check(F.every((f, i) => f.n === Pref.LIST[i].name && f.a === Pref.LIST[i].code && f.k), 'decoded in the order of the list');
  check(EN.read('ja/jp.json') === EN.read('..', '..', 'driftlog-counter', 'ja', 'jp.json'), '/ja/jp.json is the published file, untouched');
}

// ---------- 1. a point lands in the prefecture the counter's own page (/ja/) puts it in ----------
const counter = counterPage();
await counter.T.loadPrefectures();
await counter.T.loadCountries();
{
  const theirs = (lon, lat) => { const i = counter.T.prefIndex(lon, lat); return i < 0 ? null : counter.T.PREF[i].n; };
  const mine = (lon, lat) => { const c = page.T.locate(lon, lat); return c < 0 ? null : F[c / 10000].n; };
  let n = 0, inJapan = 0, diff = 0;
  const seen = new Set(), bad = [];
  for (let lat = 24.03; lat < 46.6; lat += 0.083) for (let lon = 122.03; lon < 149; lon += 0.097) {
    const a = theirs(lon, lat), b = mine(lon, lat);
    n++; if (a) { inJapan++; seen.add(a); }
    if (a !== b) { diff++; if (bad.length < 5) bad.push(`${lon.toFixed(2)},${lat.toFixed(2)}: /ja/ ${a}, pref.js ${b}`); }
  }
  check(diff === 0, `a grid of ${n} points: ${diff} differ from /ja/ (${bad.join('; ')})`);
  check(seen.size === 47 && inJapan > 5000, `the grid touches every prefecture (${seen.size}), ${inJapan} points in Japan`);
  for (const [name, lon, lat, want] of [['Tokyo', 139.77, 35.68, '東京都'], ['Naha', 127.68, 26.21, '沖縄県'], ['Sapporo', 141.35, 43.06, '北海道'], ['Kyoto', 135.77, 35.01, '京都府'],
    ['Ishigaki', 124.16, 24.34, '沖縄県'], ['Yakushima', 130.50, 30.35, '鹿児島県'], ['a ferry off Miyajima', 132.30, 34.31, '広島県'],
    ['Busan', 129.07, 35.18, null], ['Seoul', 126.98, 37.57, null], ['Taipei', 121.56, 25.03, null], ['Calgary', -114.07, 51.05, null], ['the Pacific', 150, 30, null], ['no location', 0, 0, null]])
    check(mine(lon, lat) === want && theirs(lon, lat) === want, `${name}: ${mine(lon, lat)}`);
  console.log(`locator: ${n} points agree with /ja/ (${inJapan} in Japan, all 47 prefectures)`);
}

// ---------- 2. the files: /scan.js with /ja/pref.js counts what /ja/ counts, and keeps the month ----------
// Photos (EXIF), a Google Photos sidecar and a Timeline export in Japan, with the counter's own fixtures (abroad,
// but for Tokyo in 2017) around them. No video: /ja/ reads no date from one.
const TRIP = () => [
  jpeg('tokyo-2019.jpg', 35.68, 139.77, '2019:04:02 10:00:00'), jpeg('kamakura.jpg', 35.32, 139.55, '2019:06:15 09:00:00'),
  jpeg('tokyo-2026a.jpg', 35.68, 139.77, '2026:01:03 10:00:00'), jpeg('tokyo-2026b.jpg', 35.66, 139.70, '2026:03:20 18:30:00'),
  jpeg('kyoto.jpg', 35.01, 135.77, '2026:04:05 08:00:00'), jpeg('nara.jpg', 34.68, 135.83, '2026:04:06 12:00:00'),
  jpeg('naha.jpg', 26.21, 127.68, '2026:12:28 15:00:00'), jpeg('hakodate-pier.jpg', 41.775, 140.705, '2026:08:11 06:00:00'),
  jpeg('seoul.jpg', 37.57, 126.98, '2026:05:01 10:00:00'), jpeg('undated.jpg', 43.06, 141.35, '0000:00:00 00:00:00'),
  sidecarFile('IMG_0421.JPG', 33.59, 130.40, '2026-10-12T03:00:00Z'), sidecarFile('IMG_0007.JPG', 34.39, 132.46, '2021-11-03T03:00:00Z'),
  timeline([[36.56, 136.65, '2026-06-07'], [36.70, 137.21, '2026-06-08'], [35.68, 139.77, '2026-06-09'], [34.69, 135.50, '2022-11-20'], [21.03, 105.85, '2026-07-15']], 'Timeline.json'),
];
const fed = () => [...walk(FIXTURES).filter(f => !/^(Timeline|Records|location-history)\.json$/.test(f.name)), ...TRIP()];
await counter.T.handle(fed());
await page.T.handle(fed());
{
  const a = counter.T.lastRun, b = page.T.files;
  check(!!a && !!b, 'both pages counted the files');
  const left = new Map([...a.pref].map(([i, r]) => [counter.T.PREF[i].n, { n: r.photos + r.points, y0: r.y0, y1: r.y1 }]));
  const right = new Map([...b.tally.feats].map(([fi, r]) => {
    const ys = [...r.years.keys()];
    return [F[fi].n, { n: r.n, y0: ys.length ? Math.min(...ys) : null, y1: ys.length ? Math.max(...ys) : null }];
  }));
  check(same(sorted(left.keys()), sorted(right.keys())) && left.size === 11, `same prefectures (${left.size}): ${sorted(left.keys()).join('、')} | ${sorted(right.keys()).join('、')}`);
  for (const [n, l] of left) {
    const r = right.get(n) || {};
    check(l.n === r.n && l.y0 === r.y0 && l.y1 === r.y1, `${n}: /ja/ ${JSON.stringify(l)}, year page ${JSON.stringify(r)}`);
  }
  for (const k of ['media', 'withLoc', 'sidecars', 'points'])
    check(a.stats[k] === b.stats[k], `stats.${k}: /ja/ ${a.stats[k]}, year page ${b.stats[k]}`);
  // /ja/ names the countries abroad; the year page counts prefectures only, so abroad is "not a prefecture".
  const abroad = [...a.country.values(), ...a.other.values()].reduce((s, r) => s + r.photos + r.points, 0);
  check(b.stats.unmatched === abroad + a.stats.unmatched && abroad > 10, `not in a prefecture: ${b.stats.unmatched} = ${abroad} abroad + ${a.stats.unmatched} nowhere`);
  console.log(`readers: ${left.size} prefectures agree with /ja/ (${[...left.values()].reduce((s, r) => s + r.n, 0)} locations in Japan, ${abroad} abroad)`);
}

// ---------- 3. months, and one year out of the count ----------
{
  const t = page.T.files.tally;
  const months = (name, year) => { for (const [fi, a] of t.feats) if (F[fi].n === name && a.years.has(year)) return Year.monthNames(a.years.get(year).months).join('、'); return null; };
  for (const [name, year, want] of [['東京都', 2026, '1月、3月、6月'], ['東京都', 2019, '4月'], ['東京都', 2017, '8月'], ['神奈川県', 2019, '6月'], ['京都府', 2026, '4月'], ['奈良県', 2026, '4月'],
    ['沖縄県', 2026, '12月'], ['北海道', 2026, '8月'], ['福岡県', 2026, '10月'], ['広島県', 2021, '11月'], ['石川県', 2026, '6月'], ['富山県', 2026, '6月'], ['大阪府', 2022, '11月']])
    check(months(name, year) === want, `${name} ${year}: months ${months(name, year)}, expected ${want}`);
  check(t.undated === 1, `locations with no date: ${t.undated} (the photo from a camera that never set its clock)`);
  const v = Year.yearView(t, F, 2026);
  const names = codes => sorted(codes).map(Pref.nameOf).join('、');
  check(names(v.codes) === '北海道、東京都、富山県、石川県、京都府、奈良県、福岡県、沖縄県', `2026: ${names(v.codes)}`);
  check(names(v.newCodes) === '北海道、富山県、石川県、京都府、奈良県、福岡県、沖縄県', `new in 2026: ${names(v.newCodes)} (Hokkaido too: its other photo has no date, and a photo with no date is in no year)`);
  check(names(v.earlier) === '東京都、神奈川県、大阪府、広島県' && Year.totalOf(v) === 11 && v.latest === 2026 && v.others.length === 0, `earlier years: ${names(v.earlier)}, so far ${Year.totalOf(v)}`);
  check(Year.perMonth(v).join('') === '101203010101', `2026 by month: ${Year.perMonth(v).join('')}`);
  check(Year.orderOf(v).map(Pref.nameOf).join('、') === '東京都、京都府、奈良県、富山県、石川県、北海道、福岡県、沖縄県', `order by first month, then north to south: ${Year.orderOf(v).map(Pref.nameOf).join('、')}`);
  check(Year.shareText(v) === '2026年の国内旅行は8都道府県、うち7都道府県は初めてでした。あなたの2026年も作れます:', Year.shareText(v));
  const e = Year.editView(v, new Set(['13', '26', '40', '99', 'JP']));
  check(names(e.codes) === '東京都、京都府、福岡県' && e.months.has('13') && !e.months.has('29') && names(e.newCodes) === '京都府、福岡県', 'edited by hand: only prefectures get in, and what is known about the rest is kept');
  const p = Year.pickedView(2026, new Set(['47', '01', '13', 'JP', 'US']));
  check(same(Year.orderOf(p), ['01', '13', '47']) && p.months === null && p.newCodes === null, `picked by hand: ${Year.orderOf(p)}`);
}

// ---------- 4. the card ----------
{
  await page.T.showExample();
  const ex = page.T.state;
  check(ex.example && ex.view.codes.size === 11 && sorted(ex.view.newCodes).map(Pref.nameOf).join('、') === '富山県、石川県、奈良県、大分県、沖縄県' && Year.totalOf(ex.view) === 17,
    `example: ${ex.view.codes.size} prefectures, new ${sorted(ex.view.newCodes).map(Pref.nameOf)}, so far ${Year.totalOf(ex.view)}`);
  let cv = recorder(), text = Year.drawYearCard(cv, F, ex.view, { src: 'example' });
  check(text.title === '見本 · 2026年の国内旅行' && text.count === '11都道府県' && text.sub === '初めて 5都道府県 · これまでに 17都道府県', `example card: ${text.title} / ${text.count} / ${text.sub}`);
  check(same(text.groups.map(g => g.label), ['初めての都道府県', '前にも行った都道府県']) && text.groups[0].names.join('、') === '奈良県、富山県、石川県、大分県、沖縄県' && text.groups[1].names.length === 6 && text.more === 0, `example card: new first: ${text.groups[0].names.join('、')}`);
  check(text.caption === '見本のデータです（実在の写真ではありません）' && text.url === 'counter.getdriftlog.com/ja/2026' && text.months.join('') === '202203010211', `example card: ${text.caption} / ${text.url} / ${text.months.join('')}`);
  const words = cv.drawn.map(d => d.s);
  check(words.filter(s => s.includes('見本')).length === 2 && !words.some(s => s.includes('私')), `example card: 見本 drawn ${words.filter(s => s.includes('見本')).length} times, never 私`);
  check(words.includes('ずぼ旅') && words.includes('都道府県') && words.includes('沖縄') && !words.some(s => /[\u{1F1E6}-\u{1F1FF}]/u.test(s)), 'example card: brand, unit, the Okinawa frame, and no flags');
  const latin = words.filter(s => /[A-Za-z]{2,}/.test(s));
  check(same(latin, ['counter.getdriftlog.com/ja/2026']), `Latin letters on the card: ${latin.join(' | ')}`);
  const japanese = cv.drawn.filter(d => /[぀-ヿ一-鿿]/.test(d.s));
  check(japanese.every(d => (d.font.includes(Year.JA_SANS) || d.font.includes(Year.JA_SERIF)) && /^(400|600) /.test(d.font)), 'every Japanese string is in a Japanese face, weight 400 or 600');

  // The map: every prefecture painted once, this year's in the map's orange and earlier years' pale; Okinawa in
  // its frame; the key to the two colours inside the map (upper left, over open sea), not under it.
  const box = Pref.places.map, fills = cv.ops.filter(o => o.startsWith('fillStyle='));
  const count = col => fills.filter(o => o === `fillStyle=${JSON.stringify(col)}`).length;
  check(count(Kit.COLORS.land[0]) === 47 - 17 && count(Year.PALE[0]) === 6 + 1 && count(Kit.COLORS.mine[0]) === 11 + 1 + 8 + 2, `painted: ${count(Kit.COLORS.land[0])} plain, ${count(Year.PALE[0])} pale (6 and the key), ${count(Kit.COLORS.mine[0])} in the map's orange (11, the key, 8 months, and the brand and the number above)`);
  const key = cv.drawn.filter(d => d.s === '2026年' || d.s === '2025年まで');
  check(key.length === 2 && key.every(d => d.x > box.x && d.x < 251 && d.y > box.y && d.y < box.y + 120), `the key is inside the map, at its upper left: ${key.map(d => `${d.s} ${d.x},${d.y}`)}`);
  const frame = /^strokeRect\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/.exec(cv.ops.find(o => o.startsWith('strokeRect(')) || '');
  check(frame && +frame[1] > box.x + box.w / 2 && +frame[1] + +frame[3] < box.x + box.w && +frame[2] > box.y + box.h / 2 && +frame[2] + +frame[4] <= box.y + box.h, `Okinawa's frame sits in the lower right of the map: ${frame && frame.slice(1)}`);
  const months = cv.drawn.filter(d => /^\d+月$/.test(d.s));
  check(months.length === 12 && months.every(d => d.y > box.y + box.h), 'the month strip is under the map');

  cv = recorder(); text = Year.drawYearCard(cv, F, ex.view, { src: 'photos' });
  check(text.title === '私の2026年の国内旅行' && text.caption === '自分の写真から、自分のブラウザの中で数えました' && !cv.drawn.some(d => d.s.includes('見本')), 'a card counted from photos, captioned in Japanese beside the English /kit.js');
  check(Year.caption('timeline') === '自分の位置履歴から、自分のブラウザの中で数えました' && Year.caption('edited', 'both') === '自分の写真と位置履歴から数えて、手で直しました' && Year.caption('tap') === '手で選びました', 'captions');
  cv = recorder(); text = Year.drawYearCard(cv, F, Year.pickedView(2026, new Set(['13', '26', '47'])), { src: 'tap' });
  check(text.sub === '' && text.months === null && text.groups.length === 1 && text.groups[0].names.join('、') === '東京都、京都府、沖縄県' && text.caption === '手で選びました', `a card picked by hand: ${text.groups[0].names.join('、')}`);
  check(!cv.drawn.some(d => d.s === '2026年' || /^\d+月$/.test(d.s)), 'picked by hand: no key and no months');
  check(Year.drawYearCard(recorder(), F, Year.pickedView(2026, new Set(['47'])), { src: 'tap' }).count === '1都道府県', 'one prefecture');
  text = Year.drawYearCard(recorder(), F, Year.pickedView(2026, new Set()), { src: 'tap' });
  check(text.count === '0都道府県' && text.groups.length === 0, 'no prefectures');
  // All 47 are named, however they came: picked, or counted with months and both headings (then the headings go).
  const all = new Set(Pref.LIST.map(p => p.code));
  text = Year.drawYearCard(recorder(), F, Year.pickedView(2026, all), { src: 'tap' });
  check(text.more === 0 && text.groups.flatMap(g => g.names).length === 47, 'all 47, picked: every name is on the card');
  const full = Year.newTally();
  Pref.LIST.forEach((p, i) => { Year.tallyAdd(full, i * 10000, 2026, 1 + i % 12); if (i % 2) Year.tallyAdd(full, i * 10000, 2020, 5); });
  const v47 = Year.yearView(full, F, 2026);
  text = Year.drawYearCard(recorder(), F, v47, { src: 'photos' });
  check(v47.newCodes.size === 24 && text.sub === '初めて 24都道府県' && text.more === 0 && text.groups.length === 1 && text.groups[0].label === null && text.groups[0].names.length === 47, `all 47 from photos, 24 of them new: ${text.groups.length} list of ${text.groups[0].names.length}, ${text.more} left out`);
  const half = Year.yearView(full, F, 2026); half.codes = new Set([...half.codes].slice(0, 30)); half.newCodes = new Set([...half.newCodes].filter(c => half.codes.has(c)));
  text = Year.drawYearCard(recorder(), F, half, { src: 'photos' });
  check(text.groups.length === 2 && text.more === 0, '30 from photos: the two headings still fit');
}

// ---------- 5. the page: counting, a year with nothing in it, editing, adding ----------
{
  const P = yearPage(), T = P.T;
  let picker = null, shared = null, aria = '';
  P.el('#card').setAttribute = (k, v) => { if (k === 'aria-label') aria = v; };
  P.context.DriftlogPref.picker = (host, o) => { picker = o; };
  P.context.DriftlogKit.prepareShare = (canvas, o) => { shared = o; return Object.assign({ file: null }, o); };
  await T.handle(walk(FIXTURES));
  check(T.state === null && /2026年のものはありませんでした（いちばん新しいのは2017年）/.test(P.text('#status')), `no 2026 in the files (Tokyo, 2017, is all of Japan in them): "${P.text('#status')}"`);
  const first = timeline([[35.68, 139.77, '2026-03-10'], [34.68, 135.83, '2026-07-02'], [48.86, 2.35, '2026-07-20']]);
  await T.handle([first], { adding: true });
  let st = T.state;
  check(st && same(sorted(st.view.codes), ['13', '29']) && same(sorted(st.view.newCodes), ['29']) && st.src === 'both', `this year's file added to the count: ${st && sorted(st.view.codes)} from ${st && st.src}`);
  check(P.text('#outTitle') === '2026年の国内旅行は2都道府県' && /^うち1都道府県は初めてです/.test(P.text('#outNote')), `heading "${P.text('#outTitle')}", note "${P.text('#outNote')}"`);
  const list = P.el('#yearList').innerHTML;
  check(/^<li><b>東京都<\/b><span class="mo">3月<\/span><\/li><li><b>奈良県<\/b><span class="new">初めて<\/span><span class="mo">7月<\/span><\/li>$/.test(list), `the list under the card: ${list}`);
  check(/日本の都道府県に当てはまらなかったもの（海外・海上など） \d+件/.test(P.text('#stats')) && P.text('#also') === '', `counts: "${P.text('#stats')}"`);
  await new Promise(r => setTimeout(r, 20));
  check(shared && shared.fileName === '2026年の国内旅行.png' && shared.url === 'https://counter.getdriftlog.com/ja/2026/' && shared.text === '2026年の国内旅行は2都道府県、うち1都道府県は初めてでした。あなたの2026年も作れます:', `what Share hands over: ${JSON.stringify(shared)}`);
  check(aria.startsWith('私の2026年の国内旅行：2都道府県（初めて 1都道府県）。東京都、奈良県。自分の写真と位置履歴から、'), `the card reads: ${aria}`);
  check(P.el('#appLink').href === 'https://apps.apple.com/jp/app/id6785328399?pt=129098692&ct=ja_pref_2026&mt=8', `App Store link (Japan's store, not the English kit's): ${P.el('#appLink').href}`);
  await T.handle([first], { adding: true });
  check(P.text('#status') === '選んだ1件は、もう数えてあります。', 'the same file twice');

  T.openPicker(true);
  check(same(sorted(picker.initial), ['13', '29']) && picker.doneLabel === 'カードを更新' && picker.title === '2026年に行った都道府県は？', 'Edit opens the picker on this year\'s list');
  await picker.onDone(new Set(['29', '01']));
  st = T.state;
  check(same(sorted(st.view.codes), ['01', '29']) && st.src === 'edited' && st.base === 'both' && st.view.months.has('29') && !st.view.months.has('01'), `edited: ${sorted(st.view.codes)} ${st.src}/${st.base}`);
  check(/手で追加/.test(P.el('#yearList').innerHTML) && /^ファイルから数えて、手で直しました。/.test(P.text('#outNote')), 'an edited list says so');
  await T.handle([timeline([[26.21, 127.68, '2026-08-20']])], { adding: true });
  st = T.state;
  check(same(sorted(st.view.codes), ['01', '29', '47']) && st.src === 'edited' && same(sorted(st.view.newCodes), ['29', '47']), `a later batch keeps the edit: ${sorted(st.view.codes)}`);

  T.openPicker(false);
  await picker.onDone(new Set(['47']));
  st = T.state;
  check(st.src === 'tap' && T.files === null && st.view.months === null && P.text('#outTitle') === '2026年の国内旅行は1都道府県', 'picked from scratch: the count from files is let go');
  check(/^手で選んだので、月ごとの数と「初めての都道府県」/.test(P.text('#outNote')) && P.text('#status') === 'カードができました。', 'picked by hand says so');

  await T.showExample();
  await new Promise(r => setTimeout(r, 20));
  check(P.text('#outTitle') === '見本：2026年の国内旅行は11都道府県' && P.el('#exFlag').hidden === false && /見本/.test(P.text('#stats')) && /見本/.test(P.text('#status')), 'the example says 見本 in the heading, the flag, the counts and the status');
  check(shared.fileName === '2026年の国内旅行-見本.png' && !/私/.test(shared.text) && !/私/.test(aria) && aria.startsWith('見本 · 2026年の国内旅行：11都道府県'), `the example's file is named 見本, and the card reads: ${aria.slice(0, 60)}`);

  // Photos from abroad only: the page says none is in a prefecture and where the card for trips abroad is; it does
  // not say they have no date.
  const Q = yearPage();
  await Q.T.handle([timeline([[48.86, 2.35, '2026-05-05'], [37.57, 126.98, '2026-05-06']])], { adding: true });
  const said = String(Q.el('#status').innerHTML);
  check(Q.T.state === null && /日本の都道府県に当てはまるものがありませんでした/.test(said) && /海外旅行は<a href="https:\/\/ja-counter\.getdriftlog\.com\/2026\/">国のカード<\/a>で作れます。/.test(said), `abroad only: "${said}"`);
  check(same(sorted(new Set([...P.fetched, ...Q.fetched, ...page.fetched])), ['/ja/jp.json']), `the only thing the page asked for: ${[...new Set(P.fetched)]}`);
}

// ---------- 6. the page as written ----------
{
  const html = EN.read('ja/2026/index.html'), script = html.slice(html.indexOf("<script>\n'use strict'"));
  check(/<html lang="ja">/.test(html) && /<title>2026年の旅・国内旅行 — /.test(html) && /<link rel="canonical" href="https:\/\/counter\.getdriftlog\.com\/ja\/2026\/" \/>/.test(html), 'Japanese, titled, canonical');
  check(/<meta name="apple-itunes-app" content="app-id=6785328399, affiliate-data=pt=129098692&amp;ct=ja_pref_2026_sb" \/>/.test(html), 'smart banner: ct=ja_pref_2026_sb');
  check(/id="appLink" href="https:\/\/apps\.apple\.com\/jp\/app\/id6785328399\?pt=129098692&amp;ct=ja_pref_2026&amp;mt=8"/.test(html) && !/Kit\.storeUrl\(/.test(script), 'App Store link: Japan\'s store, ct=ja_pref_2026');
  check(!/wrapped/i.test(html) && !/wrapped/i.test(EN.read('ja/pref.js')), 'the trademarked name is nowhere');
  check(/Year\.use\(\{ lang: 'ja', places: Pref\.places, words: Pref\.words \}\);/.test(script) && Pref.words.trip === '国内旅行', 'the page asks /year.js for Japanese and for prefectures, and calls the trip 国内旅行');
  check(/<nav class="kinds"[^>]*><a href="https:\/\/ja-counter\.getdriftlog\.com\/2026\/">海外旅行<\/a><a class="on" aria-current="page" href="\/ja\/2026\/">国内旅行<\/a><\/nav>/.test(html), 'the switch at the top: 海外旅行 (the other page) and 国内旅行 (here)');
  check(/<b>海外の位置は数えません。<\/b>/.test(html) && !/都道府県版|国版/.test(html) && !/countries50/.test(html), 'the page says nothing abroad is counted, loads no world map, and speaks of 海外旅行 and 国内旅行');
  const loads = [...html.matchAll(/<(?:script|img|video|source|iframe)[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]).concat([...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]));
  check(same(sorted(loads), ['/fonts.css', '/ja/pref.js', '/kit.js', '/scan.js', '/year.js']), `the page loads: ${loads.join(' ')}`);
  check(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image|\.src\s*=(?!=)|document\.cookie|localStorage/.test(script), 'the page script has no way to send anything');
  const pref = EN.read('ja/pref.js');
  check((pref.match(/\bfetch\s*\(/g) || []).length === 1 && /fetch\('\/ja\/jp\.json'\)/.test(pref) && !/XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image/.test(pref), '/ja/pref.js asks for /ja/jp.json and nothing else');
  check(/見本です（あなたの写真ではありません）/.test(html) && /og:image:alt" content="[^"]*見本/.test(html), 'the page and the social image text say 見本');
  check(/地球地図日本<\/a>（国土地理院）を加工して作成/.test(html), 'the map\'s source is credited (Geospatial Information Authority of Japan)');
  check(/<a href="\/ja\/2026\/">2026年の国内旅行<\/a>/.test(EN.read('ja/index.html')) && /<loc>https:\/\/counter\.getdriftlog\.com\/ja\/2026\/<\/loc>/.test(EN.read('sitemap.xml')), '/ja/ links to /ja/2026/ and the sitemap lists it');
}
done();
