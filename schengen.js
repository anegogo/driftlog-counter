// Driftlog Counter: the Schengen 90/180-day count, for /schengen/. Plain script, no dependencies, nothing fetched,
// nothing drawn. The page passes stays in and gets numbers back; the tests (schengen-tests.mjs) load this same file.
//
// The rule (Regulation (EU) 2016/399, Schengen Borders Code, Article 6(1)): a stay of no more than 90 days in any
// 180-day period, "which entails considering the 180-day period preceding each day of stay". The day of entry is
// the first day of stay and the day of exit the last (European Commission, short-stay calculator user manual).
// So for any day D, the days that count are D and the 179 days before it, and on every day of stay that count
// must be 90 or less.
//
// Days are whole calendar days, held as integers: days since 1970-01-01, worked out with Date.UTC only. No local
// time, so no time zone or daylight-saving change can move a day.
(function (root){
'use strict';

const LIMIT = 90, WINDOW = 180, MS = 86400000;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const pad2 = n => (n < 10 ? '0' : '') + n;

// ---------- days ----------
// "2026-03-14" -> a day number, or null when it is not a real date (2026-02-30 is not).
function parseDay(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d), back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / MS);
}
const fromYMD = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / MS);
function isoDay(n){ const t = new Date(n * MS); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; }
// "Sat 14 Nov 2026" (weekday optional). Written out here, not with toLocaleDateString, so it reads the same everywhere.
function human(n, weekday){ const t = new Date(n * MS); return (weekday ? WD[t.getUTCDay()] + ' ' : '') + `${t.getUTCDate()} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()}`; }
// Today as the person's own calendar shows it (their local date), as a day number.
function today(now){ const t = now || new Date(); return fromYMD(t.getFullYear(), t.getMonth() + 1, t.getDate()); }

// ---------- stays -> days ----------
// rows: [{ entry: 'YYYY-MM-DD', exit: 'YYYY-MM-DD' | '' }]. An empty exit is a stay still going on: counted up to
// `until` (the date being checked), or just its first day when that is earlier. Returns { days: sorted unique day
// numbers, stays: [{ entry, exit, ongoing, i }], problems: [{ i, why }] }. Overlapping rows count each day once.
function collect(rows, until){
  const set = new Set(), stays = [], problems = [];
  (rows || []).forEach((r, i) => {
    const a = parseDay(r && r.entry), rawExit = r && r.exit ? String(r.exit).trim() : '';
    if (a === null){ if ((r && r.entry) || rawExit) problems.push({ i, why: 'entry' }); return; }
    let b, ongoing = false;
    if (!rawExit){ ongoing = true; b = until != null && until > a ? until : a; }
    else {
      b = parseDay(rawExit);
      if (b === null){ problems.push({ i, why: 'exit' }); return; }
      if (b < a){ problems.push({ i, why: 'order' }); return; }
    }
    if (b - a > 3660){ problems.push({ i, why: 'long' }); return; }   // ten years: a typo, not a stay
    stays.push({ entry: a, exit: b, ongoing, i });
    for (let d = a; d <= b; d++) set.add(d);
  });
  return { days: [...set].sort((x, y) => x - y), stays, problems };
}
function addRange(days, a, b){
  const set = new Set(days);
  for (let d = a; d <= b; d++) set.add(d);
  return [...set].sort((x, y) => x - y);
}
const lower = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi){ const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const has = (days, d) => { const i = lower(days, d); return i < days.length && days[i] === d; };

// ---------- the count ----------
// Days of stay in the 180 days ending on d (d included).
const usedOn = (days, d) => lower(days, d + 1) - lower(days, d - (WINDOW - 1));
// The first day of stay, on or after `since`, on which the count is over 90; null when there is none.
function firstOver(days, since){
  for (let i = since == null ? 0 : lower(days, since); i < days.length; i++) if (usedOn(days, days[i]) > LIMIT) return days[i];
  return null;
}
// Somebody in the area on day `from` and staying on: the last day they can still be there (the day they must have
// left by, the exit day counting as a day of stay). Every stay already on the list, before and after, counts. null
// when even being there on `from` is over the limit.
function leaveBy(days, from){
  if (firstOver(addRange(days, from, from), from) !== null) return null;
  let lo = from, hi = from + WINDOW;      // being there 180 days in a row is always over, so the answer is below hi
  while (hi - lo > 1){                    // legal is monotonic: a longer stay only adds days
    const mid = (lo + hi) >> 1;
    if (firstOver(addRange(days, from, mid), from) === null) lo = mid; else hi = mid;
  }
  return lo;
}
// How many days somebody entering on day e could stay (0: they cannot enter that day).
function maxStay(days, e){ const l = leaveBy(days, e); return l === null ? 0 : l - e + 1; }
// The first day, on or after `from`, on which somebody could enter and stay n days in a row. null if none within
// the next 3 years (only possible when the list already holds a stay that is over the limit later on).
function earliestEntry(days, from, n){
  n = Math.max(1, Math.min(LIMIT, Math.floor(n) || 1));
  for (let e = from; e <= from + 3 * 366; e++){
    if (has(days, e) && has(days, e - 1)) continue;        // already inside that day: not an entry
    if (maxStay(days, e) >= n) return e;
  }
  return null;
}
// A planned stay a..b on top of the list: is it within the rule, and if not, which day goes over.
function plan(days, a, b){
  const all = addRange(days, a, b);
  const over = firstOver(all, a);
  const l = leaveBy(days, a);
  return { ok: over === null, firstOver: over, usedOnExit: usedOn(all, b), usedOnEntry: usedOn(all, a), length: b - a + 1,
           latestExit: l, maxDays: l === null ? 0 : l - a + 1 };
}
// Everything the result box shows for the date `on`.
function status(days, on){
  const used = usedOn(days, on), inside = has(days, on);
  const pastOver = firstOver(days.filter(d => d <= on));
  const laterOver = firstOver(days, on + 1);
  // The day the oldest day still in the window drops out (the count can only go down from then, if nothing is added).
  const inWin = days.slice(lower(days, on - (WINDOW - 1)), lower(days, on + 1));
  const res = { on, used, left: LIMIT - used, inside, pastOver, laterOver, nextFree: inWin.length ? inWin[0] + WINDOW : null };
  if (inside) res.leaveBy = leaveBy(days, on);
  else { res.stayIfEnter = maxStay(days, on); res.stayUntil = res.stayIfEnter ? on + res.stayIfEnter - 1 : null; }
  return res;
}
// The 180 days ending on `on`, oldest first: [{ day, stay }].
function windowDays(days, on){
  const out = [];
  for (let d = on - (WINDOW - 1); d <= on; d++) out.push({ day: d, stay: has(days, d) });
  return out;
}

// ---------- where the Schengen area is ----------
// The 29 states (25 EU members and Iceland, Liechtenstein, Norway, Switzerland), as of 1 January 2025, when
// Bulgaria and Romania became full members. Not in it: Cyprus and Ireland (EU members), and the non-member
// microstates. ISO 3166-1 alpha-2, as in /countries50.json.
const STATES = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CZ: 'Czechia', DK: 'Denmark', EE: 'Estonia', FI: 'Finland',
  FR: 'France', DE: 'Germany', GR: 'Greece', HU: 'Hungary', IS: 'Iceland', IT: 'Italy', LV: 'Latvia', LI: 'Liechtenstein',
  LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta', NL: 'Netherlands', NO: 'Norway', PL: 'Poland', PT: 'Portugal',
  RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia', ES: 'Spain', SE: 'Sweden', CH: 'Switzerland',
};
// Monaco, San Marino and Vatican City are not Schengen states but have no border checks with the Schengen
// countries around them. The page asks before counting photo days there.
const MICRO = { MC: 'Monaco', SM: 'San Marino', VA: 'Vatican City' };
// A located point: 'in' (Schengen), 'micro' (one of the three above) or 'out'. code: the country file's ISO code.
// The border file draws France and the Netherlands with their territories outside Europe, and Norway with
// Svalbard, none of which are in the Schengen area; the Canary Islands, Ceuta, Melilla, the Azores, Madeira and
// the Åland Islands are, and count.
function zone(code, lon, lat){
  if (code === 'AX') return 'in';                                    // Åland: Finland
  if (MICRO[code]) return 'micro';
  if (!STATES[code]) return 'out';
  if (code === 'FR') return lat >= 41 && lat <= 51.5 && lon >= -5.6 && lon <= 10 ? 'in' : 'out';   // mainland and Corsica
  if (code === 'NL') return lat >= 50.5 ? 'in' : 'out';              // not Aruba, Curaçao, Sint Maarten or the Caribbean Netherlands
  if (code === 'NO') return lat < 74 ? 'in' : 'out';                 // not Svalbard
  return 'in';
}
const stateName = code => code === 'AX' ? 'Finland (Åland)' : STATES[code] || MICRO[code] || code;

// ---------- photo days -> proposed stays ----------
// points: [{ day: day number, zone: 'in' | 'micro' | 'out', name }]. A day with a photo in the area is a day in the
// area (a day with photos on both sides of the border is an entry or exit day, which counts). Days next to each
// other join into one stay; so do days up to `gap` days apart when no photo in between was taken outside the area
// (nobody photographs every day). Returns [{ entry, exit, names: [...], photoDays }], oldest first.
function proposeStays(points, { gap = 3, micro = true } = {}){
  const inDays = new Map(), outDays = new Set();
  for (const p of points){
    if (p == null || !Number.isInteger(p.day)) continue;
    if (p.zone === 'in' || (micro && p.zone === 'micro')){
      if (!inDays.has(p.day)) inDays.set(p.day, new Set());
      if (p.name) inDays.get(p.day).add(p.name);
    } else outDays.add(p.day);
  }
  const sorted = [...inDays.keys()].sort((a, b) => a - b), out = [];
  let cur = null;
  for (const d of sorted){
    let join = false;
    if (cur){
      const between = d - cur.exit - 1;
      if (between === 0) join = true;
      else if (between <= gap){ join = true; for (let x = cur.exit + 1; x < d; x++) if (outDays.has(x)){ join = false; break; } }
    }
    if (join){ cur.exit = d; cur.photoDays++; for (const n of inDays.get(d)) cur.names.add(n); }
    else { cur = { entry: d, exit: d, names: new Set(inDays.get(d)), photoDays: 1 }; out.push(cur); }
  }
  return out.map(s => ({ entry: s.entry, exit: s.exit, names: [...s.names], photoDays: s.photoDays }));
}

root.DriftlogSchengen = { LIMIT, WINDOW, parseDay, fromYMD, isoDay, human, today, collect, addRange, usedOn, firstOver, leaveBy,
  maxStay, earliestEntry, plan, status, windowDays, STATES, MICRO, zone, stateName, proposeStays };
})(typeof window !== 'undefined' ? window : globalThis);
