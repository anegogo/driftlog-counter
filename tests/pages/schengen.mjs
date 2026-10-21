// Tests for /schengen.js (the 90/180 count) and the day added to /scan.js. No dependencies:
//   node tests/pages/schengen.mjs          (Node 20+, from anywhere)
// It runs itself again under four time zones (TZ=...), so a day can't move with the clock of the machine.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url)), SITE = join(HERE, '..', '..');
const ctx = { console, File, Blob, TextDecoder, DataView, Uint8Array, ArrayBuffer, Math, Date, Map, Set, Promise, setTimeout, Number, String, JSON, parseInt, isFinite, Array, Object, BigInt };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['schengen.js', 'scan.js']) vm.runInContext(readFileSync(join(SITE, f), 'utf8'), ctx, { filename: f });
const S = ctx.DriftlogSchengen, Scan = ctx.DriftlogScan;

let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else { fail++; console.log('FAIL', what); } };
const eq = (a, b, what) => check(a === b, `${what}: got ${a}, want ${b}`);
const D = S.parseDay, iso = S.isoDay;
const days = rows => S.collect(rows.map(([entry, exit]) => ({ entry, exit }))).days;

// ---------- parsing days ----------
eq(D('2026-03-14') - D('2026-03-13'), 1, 'consecutive days differ by 1');
eq(iso(D('2026-03-14')), '2026-03-14', 'round trip');
eq(D('2027-02-29'), null, '29 Feb 2027 is not a day');
check(D('2028-02-29') !== null, '29 Feb 2028 is a day');
eq(D('2026-04-31'), null, '31 April is not a day');
eq(D('2026-3-4'), null, 'only YYYY-MM-DD');
eq(D(''), null, 'empty');
eq(S.human(D('2026-11-14'), true), 'Sat 14 Nov 2026', 'human date with weekday');

// ---------- counting ----------
eq(days([['2026-05-10', '2026-05-10']]).length, 1, 'entry and exit on the same day = 1 day');
eq(days([['2026-05-10', '2026-05-11']]).length, 2, 'overnight = 2 days');
eq(days([['2028-02-28', '2028-03-01']]).length, 3, 'leap year: 28 Feb to 1 Mar 2028 = 3 days');
eq(days([['2027-02-28', '2027-03-01']]).length, 2, 'no leap year: 28 Feb to 1 Mar 2027 = 2 days');
eq(days([['2026-01-01', '2026-01-10'], ['2026-01-05', '2026-01-20']]).length, 20, 'overlapping rows count each day once');
eq(days([['2026-01-01', '2026-01-10'], ['2026-01-10', '2026-01-12']]).length, 12, 'a row starting on the day another ends: that day once');
eq(days([['2026-03-28', '2026-03-30']]).length, 3, 'over the EU clock change (29 Mar 2026) = 3 days');
eq(days([['2026-10-24', '2026-10-26']]).length, 3, 'over the EU clock change back (25 Oct 2026) = 3 days');
eq(days([['2026-03-07', '2026-03-09']]).length, 3, 'over the US clock change (8 Mar 2026) = 3 days');

// The window: day D and the 179 days before it.
{
  const on = D('2026-07-01');
  eq(S.usedOn(days([[iso(on - 179), iso(on - 179)]]), on), 1, 'a day 179 days before is inside the window');
  eq(S.usedOn(days([[iso(on - 180), iso(on - 180)]]), on), 0, 'a day 180 days before is outside the window');
  eq(S.usedOn(days([[iso(on - 200), iso(on - 170)]]), on), 10, 'a stay straddling the window start: only its days inside count (170..179 back)');
  eq(S.usedOn(days([[iso(on + 1), iso(on + 5)]]), on), 0, 'days after the date do not count on it');
  eq(S.usedOn(days([[iso(on), iso(on)]]), on), 1, 'the day itself counts');
}

// Exactly 90 and 91.
{
  const d90 = days([['2026-01-01', '2026-03-31']]);
  eq(d90.length, 90, '1 Jan to 31 Mar 2026 = 90 days');
  eq(S.firstOver(d90), null, 'exactly 90 days is within the rule');
  const d91 = days([['2026-01-01', '2026-04-01']]);
  eq(S.firstOver(d91), D('2026-04-01'), '91 days: the first day over is the 91st (1 Apr)');
  const p = S.plan([], D('2026-01-01'), D('2026-04-01'));
  check(!p.ok && p.firstOver === D('2026-04-01') && p.latestExit === D('2026-03-31') && p.maxDays === 90, 'plan of 91 days: over on day 91, latest exit day 90');
}

// The Swiss State Secretariat for Migration's examples (sem.admin.ch, "Duration of stay calculator").
{
  const swiss = days([['2025-03-01', '2025-05-29']]);
  eq(swiss.length, 90, 'SEM example 1: 1 Mar to 29 May = 90 days');
  eq(S.earliestEntry(swiss, D('2025-05-30'), 1), D('2025-08-28'), 'SEM example 1: next entry from 28 Aug');
  eq(S.maxStay(swiss, D('2025-06-15')), 0, 'SEM example 2: entry on 15 Jun 2025 is not possible');
  const ex3 = days([['2025-01-01', '2025-01-15'], ['2025-03-01', '2025-03-20']]);
  const p = S.plan(ex3, D('2025-05-01'), D('2025-06-15'));
  check(p.ok && p.usedOnExit === 81 && p.length === 46, `SEM example 3: 15 + 20 + 46 = 81 days, allowed (got ok=${p.ok}, ${p.usedOnExit}, length ${p.length}; the SEM page counts 1 May to 15 Jun as 45)`);
}

// Leave by, enter again.
{
  eq(S.leaveBy([], D('2026-06-01')), D('2026-08-29'), 'no earlier stays: in on 1 Jun, leave by 29 Aug (day 90)');
  const prior = days([['2026-01-01', '2026-01-30']]);
  eq(S.leaveBy(prior, D('2026-03-01')), D('2026-04-29'), '30 days used in January: in on 1 Mar, leave by 29 Apr (60 more)');
  const full = days([['2026-01-01', '2026-03-31']]);
  eq(S.earliestEntry(full, D('2026-04-01'), 1), D('2026-06-30'), 'after 90 days from 1 Jan: back from 30 Jun (1 Jan + 180)');
  eq(S.maxStay(full, D('2026-06-30')), 90, 'entering on 30 Jun: as one old day drops out each day, 90 days are possible');
  eq(S.leaveBy(full, D('2026-06-30')), D('2026-09-27'), '... and the last day is 27 Sep');
  eq(S.earliestEntry(full, D('2026-04-01'), 90), D('2026-06-30'), 'earliest entry for 90 days is also 30 Jun');
  eq(S.maxStay(full, D('2026-06-29')), 0, 'entering on 29 Jun is one day early');
  // A trip already planned later on cuts a stay now short.
  const later = days([['2026-09-01', '2026-10-30']]);   // 60 days
  eq(S.leaveBy(later, D('2026-06-01')), D('2026-06-30'), 'a 60-day trip from 1 Sep: in from 1 Jun, leave by 30 Jun (30 + 60 = 90 on 30 Oct)');
  check(S.firstOver(S.addRange(later, D('2026-06-01'), D('2026-06-30')), D('2026-06-01')) === null, '... staying to 30 Jun keeps the later trip within the rule');
  eq(S.firstOver(S.addRange(later, D('2026-06-01'), D('2026-07-01')), D('2026-06-01')), D('2026-10-30'), '... one more day and the later trip goes over on its last day, 30 Oct');
  // Over the limit already.
  const over = days([['2026-01-01', '2026-04-10']]);
  eq(S.leaveBy(over, D('2026-04-10')), null, 'over the limit on the day: no leave-by date');
  const st = S.status(over, D('2026-04-10'));
  check(st.used === 100 && st.left === -10 && st.pastOver === D('2026-04-01'), `status of an overstay: used ${st.used}, left ${st.left}, over since ${st.pastOver && iso(st.pastOver)}`);
}

// Status on a date.
{
  const rows = [{ entry: '2026-08-01', exit: '' }];          // still there
  const c = S.collect(rows, D('2026-08-20'));
  eq(c.days.length, 20, 'a stay with no exit date runs to the date checked');
  const st = S.status(c.days, D('2026-08-20'));
  check(st.inside && st.used === 20 && st.left === 70 && st.leaveBy === D('2026-10-29'), `ongoing stay: used ${st.used}, leave by ${st.leaveBy && iso(st.leaveBy)}`);
  const out = S.status(days([['2026-01-01', '2026-01-30']]), D('2026-03-01'));
  check(!out.inside && out.stayIfEnter === 60 && out.stayUntil === D('2026-04-29') && out.nextFree === D('2026-06-30'), `outside: could stay ${out.stayIfEnter} days; oldest day drops out ${out.nextFree && iso(out.nextFree)}`);
  const w = S.windowDays(days([['2026-03-01', '2026-03-03']]), D('2026-03-03'));
  check(w.length === 180 && w[179].stay && w[177].stay && !w[176].stay && w[0].day === D('2026-03-03') - 179, '180-day strip, oldest first');
}

// Rows that are not stays.
{
  const c = S.collect([{ entry: '2026-05-10', exit: '2026-05-01' }, { entry: 'x', exit: '' }, { entry: '', exit: '' }, { entry: '2026-01-01', exit: '2026-01-02' }]);
  check(c.problems.length === 2 && c.problems[0].why === 'order' && c.problems[1].why === 'entry' && c.days.length === 2, 'exit before entry and a bad date are reported; an empty row is ignored');
}

// Against a count done the slow way, on random lists of stays (fixed seed).
{
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const naiveUsed = (set, d) => { let k = 0; for (let x = d - 179; x <= d; x++) if (set.has(x)) k++; return k; };
  let agree = 0, cases = 0;
  for (let t = 0; t < 300; t++){
    const base = D('2026-01-01'), rows = [];
    for (let k = 0, n = 1 + rnd(5); k < n; k++){ const a = base + rnd(400); rows.push([iso(a), iso(a + rnd(40))]); }
    const ds = days(rows), set = new Set(ds);
    const from = base + rnd(500);
    // naive leave-by: walk forward one day at a time
    let naive = null;
    for (let L = from; L < from + 180; L++){
      const s2 = new Set(set); for (let x = from; x <= L; x++) s2.add(x);
      let ok = true; for (const d of s2) if (d >= from && naiveUsed(s2, d) > 90){ ok = false; break; }
      if (ok) naive = L; else break;
    }
    cases++;
    if (S.leaveBy(ds, from) === naive && S.usedOn(ds, from) === naiveUsed(set, from)) agree++;
  }
  eq(agree, cases, 'leave-by and day count agree with a slow count on 300 random lists');
}

// ---------- where the area is ----------
eq(Object.keys(S.STATES).length, 29, '29 Schengen states');
for (const c of ['BG', 'RO', 'HR', 'IS', 'LI', 'NO', 'CH']) eq(S.zone(c, 20, 45), 'in', `${c} is in`);
for (const c of ['CY', 'IE', 'GB', 'AD', 'GI', 'XK', 'RS', 'TR']) eq(S.zone(c, 20, 45), 'out', `${c} is out`);
for (const c of ['MC', 'SM', 'VA']) eq(S.zone(c, 10, 43), 'micro', `${c} is a microstate`);
eq(S.zone('FR', 2.35, 48.86), 'in', 'Paris');
eq(S.zone('FR', 9.15, 42.15), 'in', 'Corsica');
eq(S.zone('FR', -52.33, 4.93), 'out', 'French Guiana (Cayenne)');
eq(S.zone('FR', 55.45, -20.88), 'out', 'Réunion');
eq(S.zone('NL', 4.9, 52.37), 'in', 'Amsterdam');
eq(S.zone('NL', -68.27, 12.15), 'out', 'Bonaire');
eq(S.zone('NO', 10.75, 59.91), 'in', 'Oslo');
eq(S.zone('NO', 15.63, 78.22), 'out', 'Longyearbyen, Svalbard');
eq(S.zone('ES', -15.43, 28.1), 'in', 'Las Palmas, Canary Islands');
eq(S.zone('ES', -5.32, 35.89), 'in', 'Ceuta');
eq(S.zone('PT', -25.67, 37.74), 'in', 'Azores');
eq(S.zone('AX', 19.94, 60.1), 'in', 'Åland');

// ---------- photo days -> stays ----------
{
  const p = (d, zone, name) => ({ day: D(d), zone, name });
  const pts = [p('2026-04-01', 'in', 'France'), p('2026-04-02', 'in', 'France'), p('2026-04-05', 'in', 'Italy'),
    p('2026-04-20', 'in', 'Spain'), p('2026-04-22', 'out', 'Morocco'), p('2026-04-23', 'in', 'Spain'),
    p('2026-05-10', 'micro', 'Monaco')];
  const st = S.proposeStays(pts, { gap: 3, micro: true });
  eq(st.length, 4, 'four stays: 1-5 Apr (gap of 2 joined), 20 Apr, 23 Apr (Morocco in between), 10 May (Monaco)');
  check(st[0].entry === D('2026-04-01') && st[0].exit === D('2026-04-05') && st[0].names.join() === 'France,Italy' && st[0].photoDays === 3, 'first stay joined over two days without photos');
  check(st[1].exit === D('2026-04-20') && st[2].entry === D('2026-04-23'), 'a day photographed outside the area splits a stay');
  eq(S.proposeStays(pts, { gap: 3, micro: false }).length, 3, 'microstates left out when asked');
  eq(S.proposeStays(pts, { gap: 0 }).length, 5, 'gap 0: only days next to each other join');
  eq(S.proposeStays([p('2026-06-01', 'in', 'Germany'), p('2026-06-01', 'out', 'Ireland')]).length, 1, 'a day with photos on both sides is a day in the area');
}

// ---------- the day in /scan.js ----------
eq(Scan.exifDay('2026:03:14 09:26:53'), '2026-03-14', 'exifDay');
eq(Scan.exifDay('0000:00:00 00:00:00'), null, 'exifDay: a clock never set');
eq(Scan.exifDay('2026:02:30 00:00:00'), null, 'exifDay: 30 Feb');
eq(JSON.stringify(Scan.exifDate('2026:03:14 09:26:53')), '{"year":2026,"month":3}', 'exifDate unchanged for the year pages');
eq(Scan.utcDay(Date.UTC(2026, 2, 29, 23, 30)), '2026-03-29', 'utcDay is the UTC day');
function jpeg(name, lat, lon, date){   // as tests/pages/harness.mjs builds one: nothing but EXIF
  const rat = v => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.round(((a - d) * 60 - m) * 60 * 1000); return [d, 1, m, 1, s, 1000]; };
  const dateStr = date + '\0', tiff = new DataView(new ArrayBuffer(512));
  let o = 0;
  const u16 = v => { tiff.setUint16(o, v); o += 2; }, u32 = v => { tiff.setUint32(o, v); o += 4; };
  const entry = (tag, type, count, value) => { u16(tag); u16(type); u32(count); if (typeof value === 'string'){ for (let i = 0; i < 4; i++) tiff.setUint8(o + i, i < value.length ? value.charCodeAt(i) : 0); o += 4; } else u32(value); };
  u16(0x4D4D); u16(42); u32(8);
  const EXIF_AT = 8 + 2 + 2 * 12 + 4, GPS_AT = EXIF_AT + 2 + 12 + 4, DATA_AT = GPS_AT + 2 + 4 * 12 + 4;
  u16(2); entry(0x8769, 4, 1, EXIF_AT); entry(0x8825, 4, 1, GPS_AT); u32(0);
  u16(1); entry(0x9003, 2, dateStr.length, DATA_AT); u32(0);
  u16(4); entry(1, 2, 2, lat < 0 ? 'S\0' : 'N\0'); entry(2, 5, 3, DATA_AT + 24); entry(3, 2, 2, lon < 0 ? 'W\0' : 'E\0'); entry(4, 5, 3, DATA_AT + 48); u32(0);
  [...dateStr].forEach((ch, i) => tiff.setUint8(DATA_AT + i, ch.charCodeAt(0)));
  rat(lat).forEach((v, i) => tiff.setUint32(DATA_AT + 24 + i * 4, v));
  rat(lon).forEach((v, i) => tiff.setUint32(DATA_AT + 48 + i * 4, v));
  const body = new Uint8Array(tiff.buffer, 0, DATA_AT + 72);
  const head = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, (body.length + 8) >> 8, (body.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  return new File([head, body, new Uint8Array([0xFF, 0xD9])], name);
}
{
  const r = await Scan.readMedia(jpeg('a.jpg', 48.8584, 2.2945, '2026:07:14 23:59:59'));
  check(r && r.day === '2026-07-14' && r.year === 2026 && r.month === 7 && Math.abs(r.point[1] - 48.8584) < 1e-3, `readMedia day: ${JSON.stringify(r)}`);
  const sc = Scan.sidecar({ title: 'x.jpg', photoTakenTime: { timestamp: String(Date.UTC(2026, 0, 2, 12) / 1000) }, geoData: { latitude: 41.9, longitude: 12.5 } });
  eq(sc.day, '2026-01-02', 'sidecar day (UTC)');
  const got = [];
  await Scan.scanLocationFile(new File([JSON.stringify({ semanticSegments: [
    { startTime: '2026-03-14T22:00:00.000+01:00', endTime: '2026-03-14T23:00:00.000+01:00', visit: { topCandidate: { placeLocation: { latLng: '48.85°, 2.35°' } } } },
    { startTime: '2026-03-16T10:00:00.000+01:00', endTime: '2026-03-16T12:00:00.000+01:00', visit: { topCandidate: { placeLocation: { latLng: '41.90°, 12.50°' } } } }] })], 'Timeline.json'),
    (pt, y, m, d) => got.push(d));
  eq(got.join(), '2026-03-14,2026-03-16', 'Timeline.json: the local day written in the file');
  const got2 = [];
  // Older Records.json: "timestampMs" before the coordinates. Newer: "timestamp" after them, in the same object.
  await Scan.scanLocationFile(new File([JSON.stringify({ locations: [{ timestampMs: String(Date.UTC(2026, 10, 2, 5)), latitudeE7: 356812000, longitudeE7: 1397671000 },
    { timestampMs: String(Date.UTC(2026, 10, 3, 23)), latitudeE7: 356812000, longitudeE7: 1397671000 }] })], 'Records.json'), (pt, y, m, d) => got2.push(d));
  await Scan.scanLocationFile(new File([JSON.stringify({ locations: [{ latitudeE7: 488584000, longitudeE7: 22945000, timestamp: '2026-11-05T08:00:00Z' },
    { latitudeE7: 488584000, longitudeE7: 22945000, timestamp: '2026-11-07T08:00:00Z' }] })], 'Records.json'), (pt, y, m, d) => got2.push(d));
  eq(got2.join(), '2026-11-02,2026-11-03,2026-11-05,2026-11-07', 'Records.json: timestampMs (UTC) and timestamp-after days');
}

// today(): the calendar day on the person's own clock, in any zone, including the night of a clock change.
eq(iso(S.today(new Date(2026, 2, 29, 0, 30))), '2026-03-29', 'today() just after midnight on 29 Mar 2026, local');
eq(iso(S.today(new Date(2026, 9, 25, 23, 59))), '2026-10-25', 'today() just before midnight on 25 Oct 2026, local');
console.log(`${process.env.TZ || '(machine time zone)'}: ${pass} passed, ${fail} failed`);
if (!process.env.SCHENGEN_CHILD){
  let bad = fail;
  for (const tz of ['Europe/Berlin', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']){
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TZ: tz, SCHENGEN_CHILD: '1' }, encoding: 'utf8' });
    process.stdout.write(r.stdout + r.stderr);
    if (r.status !== 0) bad++;
  }
  console.log(bad ? 'SOME TESTS FAILED' : 'all time zones passed');
  process.exit(bad ? 1 : 0);
} else process.exit(fail ? 1 : 0);
