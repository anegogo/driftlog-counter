// Driftlog Counter year: one year out of a count, and the 9:16 card that shows it (/2026/). Built on /kit.js
// (countries, the world map) and fed by /scan.js (a location and a date per file). Plain script, no dependencies;
// nothing here fetches anything. The year is read out of a count of every year: counting only this year's files
// would make every country in them look new.
// English, and the 194 countries, unless a page says otherwise with use(). In Japanese a year is two cards:
// trips abroad (海外旅行: the countries other than Japan, on the Japanese counter's /2026/, ja-counter.getdriftlog.com)
// and trips at home (国内旅行: the 47 prefectures on a map of Japan, /ja/2026/ with /ja/pref.js). Which country is
// home is the page's business, not this file's. The English card is pinned by counter-2026-tests/year-en-card.mjs.
(function (root){
'use strict';
const Kit = root.DriftlogKit;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PALE = ['#EBB491', '#DDA17C'];          // on the map: been there in an earlier year, not in this one

// ---------- words ----------
// Everything the card and the share line say, and the type the card sets it in. A function that needs another
// word of its own language reads it from `this`, so a page can swap one word (use({ words })) and the rest follows.
const EN = {
  locale: 'en',
  month: m => MONTHS[m],                                   // in the list under the card: "Mar, Apr"
  mark: m => MONTHS[m][0],                                 // under a cell of the month strip
  brand: 'DRIFTLOG',
  title: (year, example) => example ? `Example · ${year} in travel` : `My ${year} in travel`,
  unit: n => n === 1 ? 'country' : 'countries',
  count(n){ return `${n} ${this.unit(n)}`; },
  fresh: (k, example) => `${k} new${example ? '' : ' to me'}`,
  soFar: all => `${all} so far`,
  legend: year => [String(year), 'earlier years'],
  heads: example => example ? { fresh: 'NEW', before: 'BEEN BEFORE', all: 'ALL NEW' } : { fresh: 'NEW TO ME', before: 'BEEN BEFORE', all: 'ALL NEW TO ME' },
  more: k => `+${k} more`,
  // The small line at the foot of the card. Picked by hand never says "photos".
  caption: (src, base) => src === 'tap' ? 'picked by hand' : Kit.resultCaption(src, base),
  url: year => `getdriftlog.com/${year}`,                    // short enough to type from a picture; it forwards to this page
  share(year, n, k){ return `My ${year} in travel: ${this.count(n)}${k ? `, ${k} of them new to me` : ''}. Make yours:`; },
  type: {
    brand: '600 24px Inter, sans-serif', title: [600, 66, 'Fraunces, Georgia, serif'], unit: '300 44px Inter, sans-serif',
    sub: '500 30px Inter, sans-serif', legend: '400 24px Inter, sans-serif', mark: '500 22px Inter, sans-serif',
    head: '600 20px Inter, sans-serif', names: px => `500 ${px}px Inter, sans-serif`, caption: [400, 25, 'Inter, sans-serif'],
  },
};
// Japanese is set as the Japanese counter sets it: JA_SANS is the one in its /kit.js and JA_SERIF the Mincho of its
// headings, in weights 400 and 600 only, as that /kit.js has them. Digits that stand alone and the address
// stay in Fraunces and Inter. The captions are its /kit.js captions, word for word (counter-2026-tests/year-ja.mjs
// compares them); they are written out here because the prefecture page sits on the English site, beside the
// English /kit.js.
const JA_SANS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif';
const JA_SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif';
const JA_FROM = { photos: '写真', timeline: '位置履歴', both: '写真と位置履歴' };
const JA = {
  locale: 'ja',
  month: m => `${m + 1}月`,
  mark: m => `${m + 1}月`,
  brand: 'ずぼ旅',
  noun: '国',
  trip: '旅',                                              // a page that draws one kind of trip says which: 海外旅行, 国内旅行
  title(year, example){ return example ? `見本 · ${year}年の${this.trip}` : `私の${year}年の${this.trip}`; },
  unit: () => 'カ国',
  count(n){ return `${n}${this.unit(n)}`; },
  fresh(k){ return `初めて ${k}${this.unit(k)}`; },
  soFar(all){ return `これまでに ${all}${this.unit(all)}`; },
  legend: year => [`${year}年`, `${year - 1}年まで`],
  heads(){ return { fresh: `初めての${this.noun}`, before: `前にも行った${this.noun}`, all: `すべて初めての${this.noun}` }; },
  more(k){ return `ほか${k}${this.unit(k)}`; },
  caption(src, base){
    if (src === 'tap') return '手で選びました';
    if (src === 'example') return '見本のデータです（実在の写真ではありません）';
    if (src === 'edited') return `自分の${JA_FROM[base] || 'ファイル'}から数えて、手で直しました`;
    return `自分の${JA_FROM[src] || JA_FROM.photos}から、自分のブラウザの中で数えました`;
  },
  url: year => `ja-counter.getdriftlog.com/${year}`,
  share(year, n, k){ return `${year}年の${this.trip}は${this.count(n)}${k ? `、うち${k}${this.unit(k)}は初めて` : ''}でした。あなたの${year}年も作れます:`; },
  type: {
    brand: `600 26px ${JA_SANS}`, title: [600, 62, `Fraunces, ${JA_SERIF}`], unit: `400 42px ${JA_SANS}`,
    sub: `600 30px ${JA_SANS}`, legend: `400 24px ${JA_SANS}`, mark: `400 20px ${JA_SANS}`,
    head: `600 22px ${JA_SANS}`, names: px => `400 ${px}px ${JA_SANS}`, caption: [400, 25, JA_SANS],
  },
};
const LANGS = { en: EN, ja: JA };

// ---------- what is counted ----------
// has, nameOf, byName (the order of a list with no months to go by) and token (a name as the card writes it) speak
// for the places; map is where the map goes on the card and drawMap paints it there. drawMap returns { pale: an
// earlier year is on the map, key: it wrote the key to the two colours itself }. oneList: see drawYearCard.
const COUNTRIES = {
  has: code => Kit.BY_CODE.has(code),
  nameOf: code => Kit.nameOf(code),
  byName: codes => Kit.byName(codes),
  token: code => `${Kit.flag(code)} ${Kit.nameOf(code)}`,
  map: { x: 50, y: 650, w: 980, h: Math.round(980 * 620 / 1200) },
  drawMap(c, FEATS, box, v){ const L = mapLayers(FEATS, v); Kit.drawWorld(c, FEATS, box, L.layerOf); return { pale: !!L.pale, key: false }; },
};
let T = EN, P = COUNTRIES;
// Called once by a page that is not the English one, before anything is counted or drawn. lang: 'ja'; places:
// what to count instead of countries (as COUNTRIES above); words: words of that language to replace.
function use({ lang, places, words } = {}){
  T = Object.assign({}, LANGS[lang] || EN, words);
  P = Object.assign({}, COUNTRIES, places);
}

// ---------- the count, by country and by month ----------
// feats: featureIndex -> { n, hit: Set of polygon indexes, years: Map year -> { months: 12-bit mask, hit: Set } }.
const newTally = () => ({ feats: new Map(), dated: 0, undated: 0 });
// code: featureIndex * 10000 + polygonIndex, as DriftlogScan.locator() returns it. A location with no year is
// counted (it is somewhere the files have been) but belongs to no year.
function tallyAdd(t, code, year, month){
  const fi = Math.floor(code / 10000), pi = code % 10000;
  let a = t.feats.get(fi);
  if (!a) t.feats.set(fi, a = { n: 0, hit: new Set(), years: new Map() });
  a.n++; a.hit.add(pi);
  if (!year){ t.undated++; return; }
  t.dated++;
  let y = a.years.get(year);
  if (!y) a.years.set(year, y = { months: 0, hit: new Set() });
  if (month >= 1 && month <= 12) y.months |= 1 << (month - 1);
  y.hit.add(pi);
}

// ---------- one year ----------
// A view is what the card shows:
//   year; codes: Set of the 194 been to in that year; months: Map code -> 12-bit mask (Jan = bit 0), or null;
//   newCodes: Set of codes with nothing dated before the year, or null when the files hold no earlier year at all
//   (then nothing can be called new); earlier: Set of codes from earlier years, or null; others: names of places
//   outside the 194 been to in the year (on the map, not in the count); latest: the latest year in the files.
// polyHits, otherHits, earlierHits: featureIndex -> Set of polygons, so a trip to Paris does not paint Guiana.
function yearView(t, FEATS, year){
  const codes = new Set(), months = new Map(), first = new Map(), earlier = new Set(), others = new Set();
  const polyHits = new Map(), otherHits = new Map(), earlierHits = new Map();
  let before = false, latest = null;
  for (const [fi, a] of t.feats){
    const f = FEATS[fi], counted = !!(f.k && f.a);
    for (const [y, rec] of a.years){
      if (latest === null || y > latest) latest = y;
      if (counted && !(first.get(f.a) <= y)) first.set(f.a, y);
      if (y < year){
        before = true;
        if (counted){
          earlier.add(f.a);
          let h = earlierHits.get(fi);
          if (!h) earlierHits.set(fi, h = new Set());
          rec.hit.forEach(p => h.add(p));
        }
      }
      if (y !== year) continue;
      if (!counted){ others.add(f.n); otherHits.set(fi, new Set(rec.hit)); continue; }
      codes.add(f.a);
      months.set(f.a, (months.get(f.a) || 0) | rec.months);
      polyHits.set(fi, new Set(rec.hit));
    }
  }
  return {
    year, codes, months, newCodes: before ? new Set([...codes].filter(c => first.get(c) === year)) : null,
    earlier: before ? earlier : null, others: [...others].sort((a, b) => a.localeCompare(b, T.locale)),
    polyHits, otherHits, earlierHits, latest,
  };
}
// A year picked by hand: the countries and nothing else.
const pickedView = (year, codes) => ({
  year, codes: new Set([...codes].filter(c => P.has(c))), months: null, newCodes: null, earlier: null,
  others: [], polyHits: null, otherHits: null, earlierHits: null, latest: null,
});
// The list of a view changed by hand: what is known about the countries still in it is kept; a country added by
// hand has no months and is not called new.
function editView(v, codes){
  const set = new Set([...codes].filter(c => P.has(c)));
  return Object.assign({}, v, {
    codes: set,
    months: v.months ? new Map([...v.months].filter(([c]) => set.has(c))) : null,
    newCodes: v.newCodes ? new Set([...v.newCodes].filter(c => set.has(c))) : null,
  });
}
const monthsKnown = v => !!v.months && [...v.months].some(([c, mask]) => mask && v.codes.has(c));
// How many of the year's countries turn up in each month, January first.
function perMonth(v){
  const out = new Array(12).fill(0);
  if (v.months) for (const [c, mask] of v.months) if (v.codes.has(c)) for (let m = 0; m < 12; m++) if (mask & (1 << m)) out[m]++;
  return out;
}
// Countries in every year read, this one included; null when only this year is known.
const totalOf = v => v.earlier ? new Set([...v.earlier, ...v.codes]).size : null;
const monthNames = mask => MONTHS.map((_, m) => m).filter(m => mask & (1 << m)).map(m => T.month(m));
// The order on the card and in the list: by the first month a country turns up, then by name.
function orderOf(v){
  const firstMonth = c => { const mask = v.months ? v.months.get(c) || 0 : 0; for (let m = 0; m < 12; m++) if (mask & (1 << m)) return m; return 12; };
  const rank = new Map(P.byName(v.codes).map((c, i) => [c, i]));
  return [...v.codes].sort((a, b) => firstMonth(a) - firstMonth(b) || rank.get(a) - rank.get(b));
}
const caption = (src, base) => T.caption(src, base);
const shareText = v => T.share(v.year, v.codes.size, v.newCodes ? v.newCodes.size : 0);

// ---------- the card: 1080 × 1920 (9:16) ----------
const CARD = { W: 1080, H: 1920 };
function roundRect(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
// Which features to paint: this year's in the map's own orange, earlier years' in a pale one.
function mapLayers(FEATS, v){
  const now = new Map(), then = new Map();
  FEATS.forEach((f, fi) => {
    if (!f.k || !f.a) return;
    if (v.codes.has(f.a)) now.set(fi, (v.polyHits && v.polyHits.get(fi)) || null);
    else if (v.earlier && v.earlier.has(f.a)) then.set(fi, (v.earlierHits && v.earlierHits.get(fi)) || null);
  });
  if (v.otherHits) for (const [fi, h] of v.otherHits) now.set(fi, h);
  const a = Kit.layers(FEATS, now), b = Kit.layers(FEATS, then, () => PALE);
  return { layerOf: fi => a(fi) || b(fi), pale: then.size };
}
// Lays tokens out in centred lines no wider than maxW. Returns [[{ s, w }]], measured in the context's font.
function flow(c, tokens, gap, maxW){
  const lines = [];
  let line = [], w = 0;
  for (const s of tokens){
    const tw = c.measureText(s).width;
    if (line.length && w + gap + tw > maxW){ lines.push(line); line = []; w = 0; }
    w += (line.length ? gap : 0) + tw;
    line.push({ s, w: tw });
  }
  if (line.length) lines.push(line);
  return lines;
}
// Draws the whole card into canvas (1080 × 1920). src: 'photos' | 'timeline' | 'both' | 'edited' | 'tap' |
// 'example'; base: what an edited list was counted from. Returns the text it drew, for the page and the tests.
function drawYearCard(canvas, FEATS, v, { src, base } = {}){
  const { W, H } = CARD, c = canvas.getContext('2d'), n = v.codes.size, example = src === 'example', F = T.type;
  const spaced = px => { if ('letterSpacing' in c) c.letterSpacing = px; };
  const fit = (str, weight, px, family, maxW) => { do { c.font = `${weight} ${px}px ${family}`; } while (c.measureText(str).width > maxW && --px > 12); };
  const k = v.newCodes ? v.newCodes.size : 0, all = totalOf(v), byMonth = monthsKnown(v);
  const text = {
    title: T.title(v.year, example),
    count: T.count(n),
    sub: [k ? T.fresh(k, example) : '', all !== null && all > n ? T.soFar(all) : ''].filter(Boolean).join(' · '),
    groups: [], more: 0, months: byMonth ? perMonth(v) : null,
    caption: T.caption(src, base), url: T.url(v.year),
  };
  c.fillStyle = '#FAF6EF'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#E6D8C6'; c.lineWidth = 2; roundRect(c, 34, 34, W - 68, H - 68, 30); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#D6692E'; c.font = F.brand; spaced('6px');
  c.fillText(T.brand, W / 2, 170); spaced('0px');
  c.fillStyle = '#322014'; fit(text.title, ...F.title, 940);
  c.fillText(text.title, W / 2, 258);
  c.fillStyle = '#D6692E'; c.font = '600 210px Fraunces, Georgia, serif';
  c.fillText(String(n), W / 2, 468);
  c.fillStyle = '#7A6555'; c.font = F.unit;
  c.fillText(T.unit(n), W / 2, 540);
  if (text.sub){ c.fillStyle = '#A84D1B'; c.font = F.sub; c.fillText(text.sub, W / 2, 604); }

  const map = P.map, items = T.legend(v.year).map((t, i) => [[Kit.COLORS.mine[0], PALE[0]][i], t]);
  const on = P.drawMap(c, FEATS, map, v, { key: items, font: F.legend });
  let y = map.y + map.h + 48;
  if (on.pale && !on.key){                                            // two swatches, centred as one line
    c.font = F.legend;
    const sw = 22, pad = 10, gap = 44;
    const width = items.reduce((s, [, t]) => s + sw + pad + c.measureText(t).width, 0) + gap * (items.length - 1);
    let x = (W - width) / 2;
    c.textAlign = 'left';
    for (const [col, t] of items){
      c.fillStyle = col; roundRect(c, x, y - 20, sw, sw, 5); c.fill();
      c.fillStyle = '#7A6555'; c.fillText(t, x + sw + pad, y);
      x += sw + pad + c.measureText(t).width + gap;
    }
    c.textAlign = 'center';
    y += 50;
  }
  if (byMonth){                                                       // twelve cells: how many countries in each month
    const cw = 64, gap = 14, x0 = (W - (12 * cw + 11 * gap)) / 2;
    text.months.forEach((count, m) => {
      const x = x0 + m * (cw + gap);
      c.fillStyle = count ? Kit.COLORS.mine[0] : '#EFE4D6'; roundRect(c, x, y, cw, cw, 14); c.fill();
      if (count){ c.fillStyle = '#fff'; c.font = '600 28px Inter, sans-serif'; c.fillText(String(count), x + cw / 2, y + cw / 2 + 10); }
      c.fillStyle = '#7A6555'; c.font = F.mark; c.fillText(T.mark(m), x + cw / 2, y + cw + 30);
    });
    y += cw + 30 + 46;
  }

  // The countries, flag beside each name: new ones first under their own small heading when that is known.
  const ordered = orderOf(v), isNew = code => !!(v.newCodes && v.newCodes.has(code)), heads = T.heads(example);
  const groups = k && k < n ? [[heads.fresh, ordered.filter(isNew)], [heads.before, ordered.filter(code => !isNew(code))]]
    : k && k === n ? [[n === 1 ? heads.fresh : heads.all, ordered]] : [[null, ordered]];
  const token = code => P.token(code);
  const top = y, bottom = 1708, maxW = 940, HEAD = 46, BETWEEN = 22;
  const lay = (px, lists) => {
    c.font = F.names(px);
    const laid = lists.map(([label, tokens]) => ({ label, lines: flow(c, tokens, px * 0.85, maxW) }));
    const height = laid.reduce((s, g) => s + (g.label ? HEAD : 0) + g.lines.length * px * 1.5, 0) + BETWEEN * (laid.length - 1);
    return { px, laid, height };
  };
  const lists = groups.map(([label, codes]) => [label, codes.map(token)]);
  let plan = null;
  // Without the month strip there is room for bigger names; a short list should not look lost on the card.
  for (let px = byMonth ? 38 : 50; px >= 22 && !plan; px -= 2){ const p = lay(px, lists); if (p.height <= bottom - top) plan = p; }
  // Where leaving a name out is worse than leaving the two headings out (P.oneList: forty-seven prefectures can all
  // be on the card, and the map of Japan leaves less room under it), the headings go first.
  if (!plan && P.oneList && lists.length > 1){
    const one = [[null, ordered.map(token)]];
    for (let px = 30; px >= 22 && !plan; px -= 2){ const p = lay(px, one); if (p.height <= bottom - top) plan = p; }
  }
  // Too many for the card at the smallest size: names come off the end, and the last one says how many.
  while (!plan){
    while (lists.length > 1 && !lists[lists.length - 1][1].length) lists.pop();
    const last = lists[lists.length - 1][1];
    if (!last.length) break;
    last.pop(); text.more++;
    const p = lay(22, lists.map(([label, tokens], i) => [label, i === lists.length - 1 ? [...tokens, T.more(text.more)] : tokens]));
    if (p.height <= bottom - top) plan = p;
  }
  if (plan && n){
    let ty = top + Math.max(0, (bottom - top - plan.height) / 2);
    for (const g of plan.laid){
      if (g.label){
        c.fillStyle = '#A84D1B'; c.font = F.head; spaced('4px'); c.textAlign = 'center';
        c.fillText(g.label, W / 2, ty + 24); spaced('0px');
        ty += HEAD;
      }
      c.fillStyle = '#322014'; c.font = F.names(plan.px); c.textAlign = 'left';
      for (const line of g.lines){
        const gap = plan.px * 0.85, width = line.reduce((s, t) => s + t.w, 0) + gap * (line.length - 1);
        let x = (W - width) / 2;
        for (const t of line){ c.fillText(t.s, x, ty + plan.px * 1.08); x += t.w + gap; }
        ty += plan.px * 1.5;
      }
      ty += BETWEEN;
      text.groups.push({ label: g.label, names: g.lines.flat().map(t => t.s) });
    }
  }
  c.textAlign = 'center';
  c.fillStyle = '#7A6555'; fit(text.caption, ...F.caption, 940);
  c.fillText(text.caption, W / 2, 1774);
  c.fillStyle = '#8F7765'; c.font = '500 26px Inter, sans-serif';
  c.fillText(text.url, W / 2, 1826);
  return text;
}

root.DriftlogYear = {
  MONTHS, PALE, CARD, newTally, tallyAdd, yearView, pickedView, editView, monthsKnown, perMonth, totalOf, monthNames,
  orderOf, caption, shareText, mapLayers, flow, drawYearCard, use, JA_SANS, JA_SERIF,
};
})(typeof window !== 'undefined' ? window : globalThis);
