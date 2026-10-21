// Driftlog Counter states: the 50 states of the United States, for the pages that count them (/us/, the line under
// the counter's own result, and /us/2026/). The table, result links, which state a point is in, the map, the card
// and the picker. Plain script, no dependencies, after /kit.js. load() asks for /us/us.json, the same file for
// everyone; nothing else here fetches anything, and nothing runs against the page when it loads.
// Borders: US Census Bureau cartographic boundary file, 1:500,000, 2024 (public domain), simplified by
// counter-tools/us-states/build_us_states.py. Tests: counter-2026-tests/states.mjs.
(function (root){
'use strict';
const Kit = root.DriftlogKit;
const esc = Kit.esc;

// ---------- the 50, and the District ----------
// Link version 1 stores one bit a row in this order (USPS code), the District of Columbia last. Never reorder,
// recode or insert rows: every link already shared depends on it. The letter is the Census Bureau's region, only
// for browsing the picker. The District is on the map and can be picked, but the count is of states: 50.
const TABLE = `
AK W Alaska
AL S Alabama
AR S Arkansas
AZ W Arizona
CA W California
CO W Colorado
CT N Connecticut
DE S Delaware
FL S Florida
GA S Georgia
HI W Hawaii
IA M Iowa
ID W Idaho
IL M Illinois
IN M Indiana
KS M Kansas
KY S Kentucky
LA S Louisiana
MA N Massachusetts
MD S Maryland
ME N Maine
MI M Michigan
MN M Minnesota
MO M Missouri
MS S Mississippi
MT W Montana
NC S North Carolina
ND M North Dakota
NE M Nebraska
NH N New Hampshire
NJ N New Jersey
NM W New Mexico
NV W Nevada
NY N New York
OH M Ohio
OK S Oklahoma
OR W Oregon
PA N Pennsylvania
RI N Rhode Island
SC S South Carolina
SD M South Dakota
TN S Tennessee
TX S Texas
UT W Utah
VA S Virginia
VT N Vermont
WA W Washington
WI M Wisconsin
WV S West Virginia
WY W Wyoming
DC S Washington, D.C.
`;
const LIST = TABLE.trim().split('\n').map((line, i) => ({ i, code: line.slice(0, 2), region: line[3], name: line.slice(5), state: line.slice(0, 2) !== 'DC' }));
const REGIONS = [['N', 'Northeast'], ['M', 'Midwest'], ['S', 'South'], ['W', 'West']];
const BY_CODE = new Map(LIST.map(s => [s.code, s]));
const DC = 'DC', TOTAL = LIST.filter(s => s.state).length;
const nameOf = code => (BY_CODE.get(code) || { name: code }).name;
const byName = codes => [...codes].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'en'));
// How many of the 50 are in a list. The District is not one of them.
const countOf = codes => { let n = 0; for (const c of codes) if (BY_CODE.has(c) && c !== DC) n++; return n; };
const statesWord = n => n === 1 ? 'state' : 'states';

// ---------- result links: /us/#s=1.<mask>[&y=<years>][&f=<from>][&b=<base>] ----------
// As the counter's own links (/kit.js): one bit a row of the table, six bits a base64url character, most
// significant first, trailing zero characters dropped (nine characters at most). Everything is after the #, which
// browsers never send to a server, so the path says nothing: there is no count in it.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const MASK_LEN = Math.ceil(LIST.length / 6), YEAR_BASE = Kit.YEAR_BASE, FROM = ['photos', 'timeline', 'both', 'edited', 'tap'];
function encodeMask(codes){
  const v = new Array(MASK_LEN).fill(0);
  for (const code of codes){ const s = BY_CODE.get(code); if (s) v[(s.i / 6) | 0] |= 32 >> (s.i % 6); }
  return v.map(x => B64[x]).join('').replace(/A+$/, '');
}
function decodeMask(str){
  if (typeof str !== 'string' || str.length > MASK_LEN || !/^[A-Za-z0-9_-]*$/.test(str)) return null;
  const codes = new Set();
  for (let k = 0; k < str.length; k++){
    const x = B64.indexOf(str[k]);
    for (let b = 0; b < 6; b++){
      if (!(x & (32 >> b))) continue;
      const i = k * 6 + b;
      if (i >= LIST.length) return null;                   // bits past the last row: not something we wrote
      codes.add(LIST[i].code);
    }
  }
  return codes;
}
// years: Map code -> first year. One character a place in the list, in table order; 'A' = unknown.
function encodeYears(codes, years){
  let s = '', any = false;
  for (const row of LIST){
    if (!codes.has(row.code)) continue;
    const y = years.get(row.code), v = y > YEAR_BASE && y - YEAR_BASE < 64 ? y - YEAR_BASE : 0;
    if (v) any = true;
    s += B64[v];
  }
  return any ? s : '';
}
function decodeYears(s, codes){
  if (s.length !== codes.size || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const years = new Map();
  let k = 0;
  for (const row of LIST){ if (!codes.has(row.code)) continue; const v = B64.indexOf(s[k++]); if (v) years.set(row.code, YEAR_BASE + v); }
  return years;
}
// The part after the #. Years and where the list came from are left out unless given: the share buttons do not
// send them, the counter's own page does when it hands its count over in the same tab.
function linkHash(codes, { years, src, base } = {}){
  const set = new Set([...codes].filter(c => BY_CODE.has(c))), y = years ? encodeYears(set, years) : '';
  return 's=1.' + encodeMask(set) + (y ? '&y=' + y : '') + (FROM.includes(src) ? '&f=' + src : '')
    + (src === 'edited' && FROM.indexOf(base) >= 0 && FROM.indexOf(base) < 3 ? '&b=' + base : '');
}
const resultUrl = codes => `${Kit.SITE}/us/#${linkHash(codes)}`;
// Reads location.hash. null: not a states link. { error }: one that cannot be used. Otherwise
// { codes: Set, years: Map | null, src, base }.
function readLink(hash){
  let h = String(hash || '').replace(/^#/, '');
  if (/%[0-9A-Fa-f]{2}/.test(h) && h.length <= 600){ try { h = decodeURIComponent(h); } catch (e){} }
  if (!/(^|&)s=/.test(h)) return null;
  if (h.length > 200) return { error: 'too-long' };
  const p = new Map();
  for (const part of h.split('&')){ const eq = part.indexOf('='); if (eq > 0 && !p.has(part.slice(0, eq))) p.set(part.slice(0, eq), part.slice(eq + 1)); }
  const m = /^(\d{1,4})\.(.*)$/.exec(p.get('s') || '');
  if (!m) return { error: 'broken' };
  if (m[1] !== '1') return { error: 'version' };
  const codes = decodeMask(m[2]);
  if (!codes) return { error: 'broken' };
  const src = FROM.includes(p.get('f')) ? p.get('f') : null, b = p.get('b');
  return { codes, years: p.has('y') ? decodeYears(p.get('y'), codes) : null, src,
    base: src === 'edited' && FROM.indexOf(b) >= 0 && FROM.indexOf(b) < 3 ? b : null };
}

// ---------- borders ----------
// /us/us.json has the shape of /countries50.json and the order of the table. FEATS[i] is LIST[i]:
// { n, a: code, k: 1 for a state, b: box, polys: [[ring, hole…]] as flat [lon, lat, …], pb: a box a polygon,
//   edge: a Uint8Array a polygon, 1 for each vertex of its outer ring that is on or near the border with Canada
//   or Mexico (the file's "x": runs of such vertices) }.
function decode(raw){
  const feats = Kit.decodeFeats(raw);
  feats.forEach((f, i) => {
    if (!LIST[i] || f.a !== LIST[i].code) throw new Error('us.json is not in the order of the table at ' + f.a);
    f.edge = f.polys.map((poly, pi) => {
      const flags = new Uint8Array(poly[0].length / 2);
      for (const [from, to] of (raw[i].x && raw[i].x[pi]) || []) flags.fill(1, from, to + 1);
      return flags;
    });
  });
  return feats;
}
let req = null;
const load = () => req || (req = fetch('/us/us.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
  .then(decode).catch(e => { req = null; throw e; }));

// ---------- which state a point is in ----------
// Returns stateOf(lon, lat) -> index in FEATS * 10000 + polygon index, or -1.
// Inside an outline: that state. The outlines follow the border with Canada and Mexico to about 65 m (down the
// middle of the Detroit River, the Niagara, the Rio Grande), so Windsor, Niagara Falls in Ontario and Tijuana
// are outside them all. Outside every outline but within 0.12° of one: the nearest state, as for countries (a
// beach, a pier, a ferry: the coast is drawn roughly) — unless the nearest stretch of outline is one that
// faces Canada or Mexico, which a point is never moved across: across the river is another country.
// stateOf.inside(lon, lat) is the first half alone: the answer only when the point is inside an outline.
function locator(FEATS){
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
    for (let fi = 0; fi < FEATS.length; fi++){
      const f = FEATS[fi], b = f.b;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      for (let pi = 0; pi < f.polys.length; pi++){
        const pb = f.pb[pi];
        if (lon < pb[0] || lon > pb[2] || lat < pb[1] || lat > pb[3]) continue;
        const poly = f.polys[pi];
        if (!inRing(lon, lat, poly[0])) continue;
        let hole = false;
        for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])){ hole = true; break; }
        if (!hole) return fi * 10000 + pi;
      }
    }
    return -1;
  }
  function nearest(lon, lat, maxDeg){
    const k = Math.cos(lat * Math.PI / 180) || 1e-6;
    let best = -1, bestD = maxDeg * maxDeg, across = false;
    for (let fi = 0; fi < FEATS.length; fi++){
      const f = FEATS[fi];
      for (let pi = 0; pi < f.polys.length; pi++){
        const pb = f.pb[pi];
        if (lon < pb[0] - maxDeg / k || lon > pb[2] + maxDeg / k || lat < pb[1] - maxDeg || lat > pb[3] + maxDeg) continue;
        const r = f.polys[pi][0], edge = f.edge[pi];
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2){
          const ax = (r[j] - lon) * k, ay = r[j+1] - lat, bx = (r[i] - lon) * k, by = r[i+1] - lat;
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          let t = L ? -(ax * dx + ay * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + t * dx, py = ay + t * dy, d = px * px + py * py;
          if (d < bestD){ bestD = d; best = fi * 10000 + pi; across = !!(edge[i / 2] && edge[j / 2]); }
        }
      }
    }
    return across ? -1 : best;
  }
  // Nothing of the fifty states lies outside these: south of Hawaii, north of Alaska, between Maine and the Aleutians.
  const far = (lon, lat) => !(lat >= 18.5 && lat <= 71.8) || (lon > -66.5 && lon < 172);
  const INSIDE = new Map(), NEAR = new Map();
  const cell = (lon, lat) => Math.round(lat * 2000) * 10000000 + Math.round(lon * 2000);   // ~50 m: state lines run through towns
  function inside(lon, lat){
    if (far(lon, lat)) return -1;
    const key = cell(lon, lat);
    let v = INSIDE.get(key);
    if (v === undefined){ v = containing(lon, lat); INSIDE.set(key, v); }
    return v;
  }
  function stateOf(lon, lat){
    const v = inside(lon, lat);
    if (v >= 0 || far(lon, lat)) return v;
    const key = cell(lon, lat);
    let w = NEAR.get(key);
    if (w === undefined){ w = nearest(lon, lat, 0.12); NEAR.set(key, w); }
    return w;
  }
  stateOf.inside = inside;
  return stateOf;
}

// ---------- the map ----------
// The lower 48 in an Albers equal-area conic, with Alaska (at 0.35 of the scale) and Hawaii set in under the
// Southwest, placed as d3's geoAlbersUsa places them. In units of the scale the land runs from -0.42 (the
// Aleutians, in their frame) to 0.362 (Maine) across and from -0.225 to 0.231 down, measured on /us/us.json;
// the map is fitted to that, not to d3's wider frame. colorOf(index) -> [fill, stroke], or null for plain
// land. The District is too small to see, so a coloured one gets a dot, as the small countries do on the world map.
const RAD = Math.PI / 180;
function conic(phi1, phi2, lon0, cLon, cLat){
  const n = (Math.sin(phi1 * RAD) + Math.sin(phi2 * RAD)) / 2, C = 1 + Math.sin(phi1 * RAD) * (2 * n - Math.sin(phi1 * RAD)), r0 = Math.sqrt(C) / n;
  const raw = (dl, lat) => { const r = Math.sqrt(C - 2 * n * Math.sin(lat * RAD)) / n; return [r * Math.sin(dl * RAD * n), r0 - r * Math.cos(dl * RAD * n)]; };
  const [cx, cy] = raw(cLon, cLat);
  return (lon, lat) => {
    let dl = lon - lon0;
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    const [x, y] = raw(dl, lat);
    return [x - cx, cy - y];                               // y grows downward, as on a canvas
  };
}
const LOWER = conic(29.5, 45.5, -96, -0.6, 38.7), ALASKA = conic(55, 65, -154, -2, 58.5), HAWAII = conic(8, 18, -157, -3, 19.9);
const MAP_W = 0.79, MAP_H = 0.462, MAP_CX = -0.029, MAP_CY = 0.003;   // the size of the land and where its middle is
// Where a point of state `code` lands in box, and the frame its part of the map is cut to.
function projection(box){
  const k = Math.min(box.w / MAP_W, box.h / MAP_H), tx = box.x + box.w / 2 - MAP_CX * k, ty = box.y + box.h / 2 - MAP_CY * k;
  const parts = {
    AK: { at: (lon, lat) => { const [x, y] = ALASKA(lon, lat); return [tx - 0.307 * k + x * 0.35 * k, ty + 0.201 * k + y * 0.35 * k]; },
      clip: [tx - 0.425 * k, ty + 0.120 * k, 0.211 * k, 0.114 * k] },
    HI: { at: (lon, lat) => { const [x, y] = HAWAII(lon, lat); return [tx - 0.205 * k + x * k, ty + 0.212 * k + y * k]; },
      clip: [tx - 0.214 * k, ty + 0.166 * k, 0.099 * k, 0.068 * k] },
    lower: { at: (lon, lat) => { const [x, y] = LOWER(lon, lat); return [tx + x * k, ty + y * k]; },
      clip: [box.x, box.y, box.w, box.h] },
  };
  return { k, of: code => parts[code] || parts.lower };
}
function drawUSA(c, FEATS, box, colorOf){
  const P = projection(box), s = P.k / 1340, dots = [];
  FEATS.forEach((f, i) => {
    const part = P.of(f.a), col = colorOf ? colorOf(i) : null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    c.save(); c.beginPath(); c.rect(...part.clip); c.clip();
    c.beginPath();
    for (const poly of f.polys) for (const r of poly){
      for (let j = 0; j < r.length; j += 2){
        const [x, y] = part.at(r[j], r[j+1]);
        if (j === 0) c.moveTo(x, y); else c.lineTo(x, y);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      c.closePath();
    }
    c.fillStyle = (col || Kit.COLORS.land)[0]; c.fill('evenodd');
    c.strokeStyle = col ? col[1] : '#D3BEA8'; c.lineWidth = (col ? 1.2 : 0.8) * s; c.stroke();
    c.restore();
    if (col && x1 - x0 < 7 * s && y1 - y0 < 7 * s) dots.push([(x0 + x1) / 2, (y0 + y1) / 2, col[0]]);
  });
  for (const [x, y, col] of dots){
    c.beginPath(); c.arc(x, y, 7 * s, 0, Math.PI * 2);
    c.fillStyle = `rgba(${parseInt(col.slice(1, 3), 16)},${parseInt(col.slice(3, 5), 16)},${parseInt(col.slice(5, 7), 16)},.25)`; c.fill();
    c.beginPath(); c.arc(x, y, 3.2 * s, 0, Math.PI * 2);
    c.fillStyle = col; c.fill();
  }
}

// ---------- images ----------
// The line under the map says where the states came from. Picked by hand never says "photos".
const caption = (src, base) => src === 'tap' ? 'picked by hand' : Kit.resultCaption(src, base);
const ADDRESS = 'getdriftlog.com/states';                  // short enough to type from a picture; it forwards to /us/
const spaced = (c, px) => { if ('letterSpacing' in c) c.letterSpacing = px; };
const colorsOf = (FEATS, codes) => i => codes.has(FEATS[i].a) ? Kit.COLORS.mine : null;
// The states page's result image, 1200 × 1150, laid out as the counter's own (/kit.js drawResultCard).
// codes: Set of codes, the District among them or not. Returns the text it drew.
function drawStatesCard(canvas, FEATS, { codes, src, base }){
  const W = 1200, H = 1150, MAP_TOP = 330, MAP_HEIGHT = 620, c = canvas.getContext('2d'), n = countOf(codes);
  const text = { kicker: src === 'example' ? 'EXAMPLE · HAS BEEN TO' : 'I HAVE BEEN TO', n: String(n),
    label: `US ${statesWord(n)}${codes.has(DC) ? ' and Washington, D.C.' : ''}`, caption: caption(src, base), url: ADDRESS };
  c.fillStyle = '#FCF7F0'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#FDF6EE'; c.fillRect(0, MAP_TOP - 40, W, MAP_HEIGHT + 80);
  drawUSA(c, FEATS, { x: 10, y: MAP_TOP, w: W - 20, h: MAP_HEIGHT }, colorsOf(FEATS, codes));
  c.textAlign = 'center';
  c.fillStyle = '#D6692E'; c.font = '600 25px Inter, sans-serif';
  spaced(c, '6px');
  c.fillText(text.kicker, W / 2, 116);
  spaced(c, '0px');
  c.fillStyle = '#322014'; c.font = '600 132px Fraunces, Georgia, serif';
  c.fillText(text.n, W / 2, 236);
  c.fillStyle = '#7A6555'; c.font = '300 38px Inter, sans-serif';
  c.fillText(text.label, W / 2, 286);
  c.fillStyle = '#7A6555'; c.font = '300 27px Inter, sans-serif';
  c.fillText(text.caption, W / 2, MAP_TOP + MAP_HEIGHT + 88);
  c.fillStyle = '#8F7765'; c.font = '400 24px Inter, sans-serif';
  c.fillText(text.url, W / 2, MAP_TOP + MAP_HEIGHT + 140);
  return text;
}
// A bare map of someone's states, 1200 × 700, for the page that opens from a result link.
function drawSharedMap(canvas, FEATS, codes){
  const c = canvas.getContext('2d');
  c.fillStyle = '#FDF6EE'; c.fillRect(0, 0, 1200, 700);
  drawUSA(c, FEATS, { x: 10, y: 40, w: 1180, h: 620 }, colorsOf(FEATS, codes));
}
// State chips as HTML, in order of name, the District last. years: optional Map code -> first year.
function chips(codes, years){
  const list = byName([...codes].filter(c => c !== DC && BY_CODE.has(c))).concat(codes.has(DC) ? [DC] : []);
  return list.map(code => `<span class="chip"><b>${esc(nameOf(code))}</b>${years && years.get(code) ? ` <span>· ${years.get(code)}</span>` : ''}</span>`).join('');
}

// ---------- picking states by hand ----------
// Fifty fit on a screen, so there is no search: four regions, every state a button, and the District on its own.
const CSS = `
.sp{background:var(--card,#FFFDFB);border:1px solid var(--line,#EAD9C9);border-radius:20px;padding:28px 20px 0;margin-top:26px;text-align:left}
.sp-t{font-family:"Fraunces",Georgia,serif;font-weight:600;font-size:23px;text-align:center;text-wrap:balance}
.sp-n{color:var(--muted,#7A6555);font-size:14px;text-align:center;margin:8px auto 0;max-width:520px}
.sp-rs{margin-top:20px;border-top:1px solid var(--line,#EAD9C9)}
.sp-r{border-bottom:1px solid var(--line,#EAD9C9);padding:14px 2px 16px}
.sp-r h3{font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#7A6555);margin-bottom:10px}
.sp-r h3 small{font-size:12px;letter-spacing:0;text-transform:none;font-weight:400;color:var(--muted2,#7D6656);margin-left:6px}
.sp-chips{display:flex;flex-wrap:wrap;gap:8px}
.sp-c{font:inherit;font-size:14px;line-height:1.3;border:1px solid var(--line,#EAD9C9);background:var(--card,#FFFDFB);color:var(--ink,#322014);border-radius:999px;padding:7px 13px;cursor:pointer}
.sp-c:hover{border-color:var(--accent,#D6692E)}
.sp-c[aria-pressed="true"]{background:var(--accent-d,#B9561F);border-color:var(--accent-d,#B9561F);color:#fff}
.sp-c:focus-visible,.sp-b:focus-visible{outline:2px solid var(--accent,#D6692E);outline-offset:2px}
.sp-bar{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:10px;margin:18px -20px 0;padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px));
  background:var(--card,#FFFDFB);border-top:1px solid var(--line,#EAD9C9);border-radius:0 0 20px 20px}
.sp-count{margin-right:auto;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.sp-b{font:inherit;font-weight:500;font-size:15px;padding:11px 17px;white-space:nowrap;border-radius:999px;cursor:pointer;border:1px solid var(--line,#EAD9C9);background:var(--card,#FFFDFB);color:var(--ink,#322014)}
.sp-b.pri{background:var(--accent-d,#B9561F);border-color:var(--accent-d,#B9561F);color:#fff}
.sp-b.pri:hover{background:var(--accent-t,#A84D1B);border-color:var(--accent-t,#A84D1B)}
@media (max-width:440px){ .sp-bar{flex-wrap:wrap} .sp-ok{flex:1 0 100%} }
`;
function injectCss(){
  if (document.getElementById('states-css')) return;
  const st = document.createElement('style');
  st.id = 'states-css'; st.textContent = CSS;
  document.head.appendChild(st);
}
// Renders the picker into host (replacing what is there). opts: initial (codes), title, doneLabel, cancelLabel
// (null: no Cancel button), district (false: the 50 only, for a card that counts states and nothing else),
// onDone(Set of codes, in table order), onCancel(). Returns { root, picked }. The same shape as the country
// picker of /kit.js.
function picker(host, opts){
  injectCss();
  const o = Object.assign({ initial: [], title: 'Which states have you been to?', doneLabel: 'Done', cancelLabel: 'Cancel', district: true }, opts);
  const rows = LIST.filter(s => s.state || o.district);
  const picked = new Set([...o.initial].filter(c => rows.some(s => s.code === c)));
  const chip = s => `<button type="button" class="sp-c" data-c="${s.code}" aria-pressed="${picked.has(s.code)}">${esc(s.name)}</button>`;
  const inRegion = r => rows.filter(s => s.state && s.region === r).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  host.innerHTML = `<div class="sp" role="group" aria-label="${esc(o.title)}">
    <h2 class="sp-t">${esc(o.title)}</h2>
    <p class="sp-n">Tap each state you've been to. Tap it again to take it out.</p>
    <div class="sp-rs">${REGIONS.map(([r, label]) => `<div class="sp-r"><h3>${label}<small data-rn="${r}"></small></h3><div class="sp-chips">${inRegion(r).map(chip).join('')}</div></div>`).join('')}
    ${o.district ? `<div class="sp-r"><h3>Not a state<small>on the map, not in the count</small></h3><div class="sp-chips">${chip(BY_CODE.get(DC))}</div></div>` : ''}</div>
    <div class="sp-bar"><span class="sp-count" aria-live="polite"></span>${o.cancelLabel ? `<button type="button" class="sp-b sp-x">${esc(o.cancelLabel)}</button>` : ''}<button type="button" class="sp-b pri sp-ok">${esc(o.doneLabel)}</button></div>
  </div>`;
  const el = host.firstElementChild;
  const sync = () => {
    el.querySelectorAll('.sp-c').forEach(b => b.setAttribute('aria-pressed', String(picked.has(b.dataset.c))));
    for (const [r] of REGIONS){ const all = inRegion(r); el.querySelector(`[data-rn="${r}"]`).textContent = `${all.filter(s => picked.has(s.code)).length} of ${all.length}`; }
    const n = countOf(picked);
    el.querySelector('.sp-count').textContent = `${n} ${statesWord(n)}${picked.has(DC) ? ' + D.C.' : ''}`;
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('.sp-c');
    if (b){ if (picked.has(b.dataset.c)) picked.delete(b.dataset.c); else picked.add(b.dataset.c); sync(); return; }
    if (e.target.closest('.sp-ok')){ if (o.onDone) o.onDone(new Set(LIST.filter(s => picked.has(s.code)).map(s => s.code))); return; }
    if (e.target.closest('.sp-x') && o.onCancel) o.onCancel();
  });
  sync();
  return { root: el, picked };
}

// ---------- for /year.js: the states as what a year is counted in (/us/2026/) ----------
// The District is not a state, so on the year card it is among the "also" places: on the map, not in the count.
// DriftlogYear.use({ places: DriftlogStates.places, words: DriftlogStates.words })
const places = {
  has: code => BY_CODE.has(code) && code !== DC,
  nameOf, byName,
  token: code => nameOf(code),
  map: { x: 100, y: 650, w: 880, h: Math.round(880 * MAP_H / MAP_W) },
  drawMap(c, FEATS, box, v){
    const Year = root.DriftlogYear;
    let pale = false;
    drawUSA(c, FEATS, box, i => {
      if (v.codes.has(FEATS[i].a) || (v.otherHits && v.otherHits.has(i))) return Kit.COLORS.mine;
      if (v.earlier && v.earlier.has(FEATS[i].a)){ pale = true; return Year.PALE; }
      return null;
    });
    return { pale, key: false };
  },
};
const words = { unit: statesWord, url: year => `getdriftlog.com/${year}` };

root.DriftlogStates = {
  LIST, REGIONS, BY_CODE, DC, TOTAL, MASK_LEN, FROM, ADDRESS, nameOf, byName, countOf, statesWord,
  encodeMask, decodeMask, linkHash, resultUrl, readLink, decode, load, locator, conic, projection, drawUSA,
  caption, drawStatesCard, drawSharedMap, chips, picker, places, words,
};
})(typeof window !== 'undefined' ? window : globalThis);
