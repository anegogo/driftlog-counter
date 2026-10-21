// Driftlog Counter prefectures: the 47 prefectures of Japan, for the page that looks at one year of trips at home
// (国内旅行, /ja/2026/; trips abroad are the other card, on ja-counter.getdriftlog.com/2026/). The same borders
// (/ja/jp.json), the same rule for a point (inside an outline, or within 0.12° of one, so a photo from a pier or a
// ferry still counts) and the same map (Okinawa in a frame of its own) as the
// prefecture counter's own page (/ja/, whose script is inline). Plain script, no dependencies, after /kit.js and
// /year.js. load() asks for /ja/jp.json, the same file for everyone; nothing else here fetches anything.
//   DriftlogYear.use({ lang: 'ja', places: DriftlogPref.places, words: DriftlogPref.words })
// A change to the rule or the map on /ja/ belongs here too (counter-2026-tests/year-pref.mjs compares them).
(function (root){
'use strict';
const Kit = root.DriftlogKit, Year = root.DriftlogYear;

// ---------- the 47 ----------
// In the order of their JIS X 0401 codes ("01" Hokkaido to "47" Okinawa), which is also north to south, the order
// people expect a list of prefectures in. /ja/jp.json has them in another order; decode() sorts them into this one.
const NAMES = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
const LIST = NAMES.map((name, i) => ({ code: String(i + 1).padStart(2, '0'), name }));
const BY_CODE = new Map(LIST.map(p => [p.code, p]));
// [label, first code, last code]: the eight regions as schoolbooks have them, Hokkaido with Tohoku to keep it short.
const REGIONS = [['北海道・東北', 1, 7], ['関東', 8, 14], ['中部', 15, 23], ['近畿', 24, 30], ['中国', 31, 35], ['四国', 36, 39], ['九州・沖縄', 40, 47]];
const nameOf = code => (BY_CODE.get(code) || { name: code }).name;
const byName = codes => [...codes].sort();                 // two-digit codes: north to south
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- borders ----------
function ringBox(r){
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < r.length; i += 2){ const x = r[i], y = r[i+1]; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return [a, b, c, d];
}
// /ja/jp.json -> FEATS, one a prefecture in the order of LIST: { n: name, a: code, k: 1 (counted, as a country of
// the 194 is in /kit.js), polys: [[ring, hole…]] as flat [lon, lat, lon, lat…], pb: a box a polygon, b: the box of
// them all, at: where it stood in the file }.
function decode(raw){
  const at = new Map(raw.map((f, i) => [f.n, i]));
  return LIST.map(p => {
    if (!at.has(p.name)) throw new Error('jp.json has no ' + p.name);
    const polys = raw[at.get(p.name)].c.map(poly => poly.map(r => Float64Array.from(r.flat())));
    const pb = polys.map(q => ringBox(q[0]));
    const b = [Math.min(...pb.map(x => x[0])), Math.min(...pb.map(x => x[1])), Math.max(...pb.map(x => x[2])), Math.max(...pb.map(x => x[3]))];
    return { n: p.name, a: p.code, k: 1, polys, pb, b, at: at.get(p.name) };
  });
}
let req = null;
const load = () => req || (req = fetch('/ja/jp.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then(decode).catch(e => { req = null; throw e; }));

// ---------- which prefecture a point is in ----------
// Returns prefectureOf(lon, lat) -> index in FEATS * 10000 (the form DriftlogYear.tallyAdd takes; there is no
// polygon to tell apart), or -1: abroad, at sea, or in Japan but far from every outline.
function locator(FEATS){
  const JP_BOX = [122, 24, 154, 46.5];
  // In the order of the file, as /ja/ goes through them: where two outlines are equally near, the first one wins.
  const SCAN = FEATS.map((f, i) => [f, i]).sort((x, y) => x[0].at - y[0].at);
  function inRing(x, y, r){
    let inside = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2){
      const yi = r[i+1], yj = r[j+1];
      if ((yi > y) !== (yj > y)){
        const xi = r[i], xj = r[j];
        if (x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }
  function containing(lon, lat){
    for (const [p, i] of SCAN){
      const b = p.b;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      for (let k = 0; k < p.polys.length; k++){
        const q = p.pb[k];
        if (lon < q[0] || lon > q[2] || lat < q[1] || lat > q[3]) continue;
        const poly = p.polys[k];
        if (!inRing(lon, lat, poly[0])) continue;
        let hole = false;
        for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])){ hole = true; break; }
        if (!hole) return i;
      }
    }
    return -1;
  }
  // A photo from a coast, a harbour or a ferry falls just outside the simplified coastline: within about 13 km
  // it goes to the nearest prefecture.
  function nearest(lon, lat, maxDeg){
    const k = Math.cos(lat * Math.PI / 180) || 1e-6;
    let best = -1, bestD = maxDeg * maxDeg;
    for (const [p, i] of SCAN){
      const b = p.b;
      if (lon < b[0] - maxDeg / k || lon > b[2] + maxDeg / k || lat < b[1] - maxDeg || lat > b[3] + maxDeg) continue;
      for (const poly of p.polys){
        const r = poly[0];
        for (let a = 0, j = r.length - 2; a < r.length; j = a, a += 2){
          const ax = (r[j] - lon) * k, ay = r[j+1] - lat, bx = (r[a] - lon) * k, by = r[a+1] - lat;
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          let t = L ? -(ax * dx + ay * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + t * dx, py = ay + t * dy, d = px * px + py * py;
          if (d < bestD){ bestD = d; best = i; }
        }
      }
    }
    return best;
  }
  const CACHE = new Map();
  return function prefectureOf(lon, lat){
    if (!(lon >= JP_BOX[0] && lon <= JP_BOX[2] && lat >= JP_BOX[1] && lat <= JP_BOX[3])) return -1;
    const key = Math.round(lat * 200) * 100000 + Math.round(lon * 200);   // ~500 m cells
    let i = CACHE.get(key);
    if (i === undefined){ i = containing(lon, lat); if (i < 0) i = nearest(lon, lat, 0.12); CACHE.set(key, i); }
    return i < 0 ? -1 : i * 10000;
  };
}

// ---------- the map of Japan ----------
// The main islands as large as they fit in box, centred; Okinawa's main island in a frame at the lower right, over
// open sea, as on /ja/ (where a degree of latitude is 57.5 px: `s` is this map's size next to that one).
// colorOf(index) -> [fill, stroke], or null for plain land.
const MAIN = { lon0: 128.3, lon1: 146.4, lat0: 30.5, lat1: 45.8 }, OKI = { lon0: 126.6, lon1: 128.5, lat0: 26.0, lat1: 26.95 };
const COS = Math.cos(38 * Math.PI / 180), OKINAWA = 46;
function drawJapan(c, FEATS, box, colorOf){
  const k = Math.min(box.h / (MAIN.lat1 - MAIN.lat0), box.w / ((MAIN.lon1 - MAIN.lon0) * COS)), s = k / 57.5;
  const mw = (MAIN.lon1 - MAIN.lon0) * COS * k, mx = box.x + (box.w - mw) / 2, my = box.y + (box.h - (MAIN.lat1 - MAIN.lat0) * k) / 2;
  const main = (lon, lat) => [mx + (lon - MAIN.lon0) * COS * k, my + (MAIN.lat1 - lat) * k];
  const ow = 250 * s, oh = 200 * s, ox = Math.min(mx + mw - 98 * s, box.x + box.w - ow - 10 * s), oy = box.y + box.h - 230 * s;
  const ko = Math.min(oh / (OKI.lat1 - OKI.lat0), ow / ((OKI.lon1 - OKI.lon0) * COS));
  const oki = (lon, lat) => [ox + (lon - OKI.lon0) * COS * ko, oy + (OKI.lat1 - lat) * ko];
  const paint = (i, project) => {
    const col = colorOf(i);
    c.beginPath();
    for (const poly of FEATS[i].polys) for (const r of poly){
      for (let j = 0; j < r.length; j += 2){ const [x, y] = project(r[j], r[j+1]); if (j === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.closePath();
    }
    c.fillStyle = (col || Kit.COLORS.land)[0]; c.fill();
    c.strokeStyle = (col || Kit.COLORS.land)[1]; c.lineWidth = (col ? 1.2 : 0.7) * s; c.stroke();
  };
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
  FEATS.forEach((f, i) => { if (i !== OKINAWA) paint(i, main); });
  c.restore();
  c.save(); c.beginPath(); c.rect(ox - 10 * s, oy - 10 * s, ow + 20 * s, oh + 20 * s); c.clip();
  paint(OKINAWA, oki);
  c.restore();
  c.strokeStyle = '#E0CDBA'; c.lineWidth = 1.2; c.strokeRect(ox - 10 * s, oy - 10 * s, ow + 20 * s, oh + 20 * s);
  c.textAlign = 'left'; c.fillStyle = '#8F7765'; c.font = `400 ${Math.max(18, Math.round(20 * s))}px ${Year.JA_SANS}`;
  c.fillText('沖縄', ox - 6 * s, oy - 20 * s);
  c.textAlign = 'center';
}

// ---------- for /year.js ----------
function swatch(c, x, y, w, r){                          // a rounded square, as the key under the world map has
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + w, r); c.arcTo(x + w, y + w, x, y + w, r);
  c.arcTo(x, y + w, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
// The prefectures as what a year is counted in: names without flags, and the map above. Japan stands on end, so
// the map leaves open sea at its upper left, and the key to the two colours goes there instead of under the map.
const places = {
  has: code => BY_CODE.has(code),
  nameOf, byName,
  token: code => nameOf(code),
  map: { x: 50, y: 640, w: 980, h: 620 },
  oneList: true,                                         // all 47 names fit on the card; they are never cut for the headings
  drawMap(c, FEATS, box, v, { key, font }){
    let pale = false;
    drawJapan(c, FEATS, box, i => {
      if (v.codes.has(FEATS[i].a)) return Kit.COLORS.mine;
      if (v.earlier && v.earlier.has(FEATS[i].a)){ pale = true; return Year.PALE; }
      return null;
    });
    if (pale){
      c.font = font; c.textAlign = 'left';
      key.forEach(([col, t], i) => {
        const x = box.x + 36, y = box.y + 44 + i * 42;
        c.fillStyle = col; swatch(c, x, y - 20, 22, 5); c.fill();
        c.fillStyle = '#7A6555'; c.fillText(t, x + 32, y);
      });
      c.textAlign = 'center';
    }
    return { pale, key: true };
  },
};
const words = { noun: '都道府県', unit: () => '都道府県', trip: '国内旅行', url: year => `counter.getdriftlog.com/ja/${year}` };

// ---------- picking prefectures by hand ----------
// Forty-seven fit on a screen, so there is no search: seven regions, every prefecture a button.
const CSS = `
.pp{background:var(--card,#FFFDFB);border:1px solid var(--line,#EAD9C9);border-radius:20px;padding:28px 20px 0;margin-top:26px;text-align:left}
.pp-t{font-family:"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP",serif;font-weight:600;font-size:23px;text-align:center;text-wrap:balance}
.pp-n{color:var(--muted,#7A6555);font-size:14px;text-align:center;margin:8px auto 0;max-width:520px}
.pp-rs{margin-top:20px;border-top:1px solid var(--line,#EAD9C9)}
.pp-r{border-bottom:1px solid var(--line,#EAD9C9);padding:14px 2px 16px}
.pp-r h3{font-size:13px;font-weight:600;letter-spacing:.12em;color:var(--muted,#7A6555);margin-bottom:10px}
.pp-r h3 small{font-size:12px;letter-spacing:0;font-weight:400;color:var(--muted2,#7D6656);margin-left:6px}
.pp-chips{display:flex;flex-wrap:wrap;gap:8px}
.pp-c{font:inherit;font-size:14px;line-height:1.3;border:1px solid var(--line,#EAD9C9);background:var(--card,#FFFDFB);color:var(--ink,#322014);border-radius:999px;padding:7px 13px;cursor:pointer}
.pp-c:hover{border-color:var(--accent,#D6692E)}
.pp-c[aria-pressed="true"]{background:var(--accent-d,#B9561F);border-color:var(--accent-d,#B9561F);color:#fff}
.pp-c:focus-visible,.pp-b:focus-visible{outline:2px solid var(--accent,#D6692E);outline-offset:2px}
.pp-bar{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:10px;margin:18px -20px 0;padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px));
  background:var(--card,#FFFDFB);border-top:1px solid var(--line,#EAD9C9);border-radius:0 0 20px 20px}
.pp-count{margin-right:auto;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.pp-b{font:inherit;font-weight:500;font-size:15px;padding:11px 17px;white-space:nowrap;border-radius:999px;cursor:pointer;border:1px solid var(--line,#EAD9C9);background:var(--card,#FFFDFB);color:var(--ink,#322014)}
.pp-b.pri{background:var(--accent-d,#B9561F);border-color:var(--accent-d,#B9561F);color:#fff}
.pp-b.pri:hover{background:var(--accent-t,#A84D1B);border-color:var(--accent-t,#A84D1B)}
@media (max-width:440px){ .pp-bar{flex-wrap:wrap} .pp-ok{flex:1 0 100%} }
`;
function injectCss(){
  if (document.getElementById('pref-css')) return;
  const st = document.createElement('style');
  st.id = 'pref-css'; st.textContent = CSS;
  document.head.appendChild(st);
}
// Renders the picker into host (replacing what is there). opts: initial (codes), title, doneLabel, cancelLabel
// (null: no Cancel button), onDone(Set of codes), onCancel(). Returns { root, picked }. The same shape as the
// country picker of /kit.js, so the year page drives either.
function picker(host, opts){
  injectCss();
  const o = Object.assign({ initial: [], title: '行ったことのある都道府県は？', doneLabel: '完了', cancelLabel: 'キャンセル' }, opts);
  const picked = new Set([...o.initial].filter(c => BY_CODE.has(c)));
  const chip = p => `<button type="button" class="pp-c" data-c="${p.code}" aria-pressed="${picked.has(p.code)}">${esc(p.name)}</button>`;
  host.innerHTML = `<div class="pp" role="group" aria-label="${esc(o.title)}">
    <h2 class="pp-t">${esc(o.title)}</h2>
    <p class="pp-n">行った都道府県をタップしてください。もう一度タップすると外れます。</p>
    <div class="pp-rs">${REGIONS.map(([label, from, to]) => `<div class="pp-r"><h3>${label}<small data-rn="${from}"></small></h3><div class="pp-chips">${LIST.slice(from - 1, to).map(chip).join('')}</div></div>`).join('')}</div>
    <div class="pp-bar"><span class="pp-count" aria-live="polite"></span>${o.cancelLabel ? `<button type="button" class="pp-b pp-x">${esc(o.cancelLabel)}</button>` : ''}<button type="button" class="pp-b pri pp-ok">${esc(o.doneLabel)}</button></div>
  </div>`;
  const el = host.firstElementChild;
  const sync = () => {
    el.querySelectorAll('.pp-c').forEach(b => b.setAttribute('aria-pressed', String(picked.has(b.dataset.c))));
    for (const [, from, to] of REGIONS)
      el.querySelector(`[data-rn="${from}"]`).textContent = `${LIST.slice(from - 1, to).filter(p => picked.has(p.code)).length} / ${to - from + 1}`;
    el.querySelector('.pp-count').textContent = `${picked.size}都道府県`;
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('.pp-c');
    if (b){ if (picked.has(b.dataset.c)) picked.delete(b.dataset.c); else picked.add(b.dataset.c); sync(); return; }
    if (e.target.closest('.pp-ok')){ if (o.onDone) o.onDone(new Set(byName(picked))); return; }
    if (e.target.closest('.pp-x') && o.onCancel) o.onCancel();
  });
  sync();
  return { root: el, picked };
}

root.DriftlogPref = { LIST, REGIONS, BY_CODE, nameOf, byName, decode, load, locator, drawJapan, places, words, picker };
})(typeof window !== 'undefined' ? window : globalThis);
