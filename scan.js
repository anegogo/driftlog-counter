// Driftlog Counter scan: reading a location and a date out of photos, videos and location exports, in the browser.
// The same readers as the counter's own page (the inline script of /index.html), with the month kept as well as
// the year, for the pages that look at one year (/2026/). Plain script, no dependencies. Nothing here fetches
// anything, and nothing here draws: a page passes files in and gets { point: [lon, lat], year, month } back,
// plus day ("YYYY-MM-DD" or null) for the page that counts days (/schengen/).
// A change to a reader on the counter's page belongs here too (tests: counter-2026-tests/year.mjs compares them).
(function (root){
'use strict';

const tick = () => new Promise(r => setTimeout(r, 0));

// ---------- which country a point is in ----------
// FEATS: DriftlogKit.decodeFeats() of /countries50.json, smallest first so an enclave wins.
// Returns countryIndex(lon, lat) -> featureIndex * 10000 + polygonIndex, or -1.
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
  // Photos taken on a beach, a pier or a ferry often fall just outside simplified coastlines.
  function nearest(lon, lat, maxDeg){
    const k = Math.cos(lat * Math.PI / 180) || 1e-6;
    let best = -1, bestD = maxDeg * maxDeg;
    for (let fi = 0; fi < FEATS.length; fi++){
      const f = FEATS[fi], b = f.b;
      if (lon < b[0] - maxDeg / k || lon > b[2] + maxDeg / k || lat < b[1] - maxDeg || lat > b[3] + maxDeg) continue;
      for (let pi = 0; pi < f.polys.length; pi++){
        const r = f.polys[pi][0];
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2){
          const ax = (r[j] - lon) * k, ay = r[j+1] - lat, bx = (r[i] - lon) * k, by = r[i+1] - lat;
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          let t = L ? -(ax * dx + ay * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + t * dx, py = ay + t * dy, d = px * px + py * py;
          if (d < bestD){ bestD = d; best = fi * 10000 + pi; }
        }
      }
    }
    return best;
  }
  const CACHE = new Map();
  return function countryIndex(lon, lat){
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) || (lat === 0 && lon === 0)) return -1;
    const key = Math.round(lat * 200) * 100000 + Math.round(lon * 200);   // ~500 m cells
    let fi = CACHE.get(key);
    if (fi === undefined){ fi = containing(lon, lat); if (fi < 0) fi = nearest(lon, lat, 0.12); CACHE.set(key, fi); }
    return fi;
  };
}

// ---------- dates ----------
// "2026:03:14 09:26:53" (EXIF) or "2026:03:14" (GPSDateStamp). A year that cannot be right gives null; a month
// that cannot be right gives the year alone.
function exifDate(s){
  const y = parseInt(s.slice(0, 4), 10), m = parseInt(s.slice(5, 7), 10);
  if (!(y > 1900 && y < 2100)) return null;
  return { year: y, month: m >= 1 && m <= 12 ? m : null };
}
const utcDate = ms => { const d = new Date(ms), y = d.getUTCFullYear(); return y > 1900 && y < 2100 ? { year: y, month: d.getUTCMonth() + 1 } : null; };
// The calendar day as well, "YYYY-MM-DD", or null when the date cannot be right. Added for /schengen/, which counts
// days; exifDate and utcDate above are unchanged, so the year pages read exactly what they read before.
const pad2 = n => (n < 10 ? '0' : '') + n;
function isoDay(y, m, d){
  if (!(y > 1900 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? `${y}-${pad2(m)}-${pad2(d)}` : null;   // 31 April is not a day
}
const exifDay = s => s ? isoDay(parseInt(s.slice(0, 4), 10), parseInt(s.slice(5, 7), 10), parseInt(s.slice(8, 10), 10)) : null;
const utcDay = ms => { const d = new Date(ms); return isFinite(d) ? isoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) : null; };

// ---------- EXIF / TIFF ----------
const TYPE_SIZE = {1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8,12:8};
function readTiff(v, tiff){
  try {
    const bom = v.getUint16(tiff), le = bom === 0x4949;
    if (!le && bom !== 0x4D4D) return null;
    const magic = v.getUint16(tiff + 2, le);
    if (magic !== 42 && magic !== 0x4F52 && magic !== 0x5352 && magic !== 0x0055) return null;   // TIFF, Olympus ORF, Panasonic RW2
    const ifd = off => {
      const m = new Map();
      if (off + 2 > v.byteLength) return m;
      const n = v.getUint16(off, le);
      for (let i = 0; i < n; i++){ const e = off + 2 + i * 12; if (e + 12 > v.byteLength) break; m.set(v.getUint16(e, le), e); }
      return m;
    };
    const valOff = e => { const size = (TYPE_SIZE[v.getUint16(e + 2, le)] || 1) * v.getUint32(e + 4, le); return size <= 4 ? e + 8 : tiff + v.getUint32(e + 8, le); };
    const ascii = e => { const o = valOff(e), n = v.getUint32(e + 4, le); let s = ''; for (let i = 0; i < n && o + i < v.byteLength; i++){ const c = v.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
    const rat3 = e => { const o = valOff(e); const r = k => { const a = v.getUint32(o + k * 8, le), b = v.getUint32(o + k * 8 + 4, le); return b ? a / b : 0; }; return r(0) + r(1) / 60 + r(2) / 3600; };
    const ifd0 = ifd(tiff + v.getUint32(tiff + 4, le));
    let when = null, point = null, raw = null;
    if (ifd0.has(0x8769)){
      const ex = ifd(tiff + v.getUint32(ifd0.get(0x8769) + 8, le));
      if (ex.has(0x9003)) when = exifDate(raw = ascii(ex.get(0x9003)));    // DateTimeOriginal
    }
    if (!when && ifd0.has(0x0132)) when = exifDate(raw = ascii(ifd0.get(0x0132)));   // DateTime
    if (ifd0.has(0x8825)){
      const g = ifd(tiff + v.getUint32(ifd0.get(0x8825) + 8, le));
      if (g.has(2) && g.has(4)){
        let lat = rat3(g.get(2)), lon = rat3(g.get(4));
        if (g.has(1) && ascii(g.get(1)) === 'S') lat = -lat;
        if (g.has(3) && ascii(g.get(3)) === 'W') lon = -lon;
        if (isFinite(lat) && isFinite(lon) && !(lat === 0 && lon === 0)) point = [lon, lat];
      }
      if (!when && g.has(29)) when = exifDate(raw = ascii(g.get(29)));     // GPSDateStamp
    }
    return { point, year: when ? when.year : null, month: when ? when.month : null, day: when ? exifDay(raw) : null };
  } catch (e){ return null; }
}
function jpegTiffStart(v){
  if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return -1;
  let o = 2;
  while (o + 4 <= v.byteLength){
    if (v.getUint8(o) !== 0xFF) return -1;
    const m = v.getUint8(o + 1);
    if (m === 0xFF){ o++; continue; }
    if (m === 0xD9 || m === 0xDA) return -1;
    const len = v.getUint16(o + 2);
    if (m === 0xE1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966 && v.getUint16(o + 8) === 0) return o + 10;
    o += 2 + len;
  }
  return -2;
}
function scanExifMarker(u8){
  for (let i = u8.indexOf(0x45); i >= 0 && i < u8.length - 6; i = u8.indexOf(0x45, i + 1)){
    if (u8[i+1] === 0x78 && u8[i+2] === 0x69 && u8[i+3] === 0x66 && u8[i+4] === 0 && u8[i+5] === 0) return i + 6;
  }
  return -1;
}
async function readJpeg(file){
  let buf = await file.slice(0, 128 * 1024).arrayBuffer();
  let v = new DataView(buf), t = jpegTiffStart(v);
  if (t === -2 && file.size > buf.byteLength){ buf = await file.slice(0, 1024 * 1024).arrayBuffer(); v = new DataView(buf); t = jpegTiffStart(v); }
  if (t < 0) t = scanExifMarker(new Uint8Array(buf));
  return t < 0 ? null : readTiff(v, t);
}
const fourcc = (v, o) => String.fromCharCode(v.getUint8(o), v.getUint8(o+1), v.getUint8(o+2), v.getUint8(o+3));
async function readHeif(file){
  try {
    const v = new DataView(await file.slice(0, 512 * 1024).arrayBuffer());
    let o = 0, meta = null;
    while (o + 8 <= v.byteLength){
      let size = v.getUint32(o), hdr = 8; const type = fourcc(v, o + 4);
      if (size === 1){ size = Number(v.getBigUint64(o + 8)); hdr = 16; } else if (size === 0) size = v.byteLength - o;
      if (type === 'meta'){ meta = [o + hdr + 4, Math.min(o + size, v.byteLength)]; break; }
      if (size < 8) break; o += size;
    }
    if (!meta) return null;
    let exifId = null, iloc = -1;
    for (let p = meta[0]; p + 8 <= meta[1];){
      const size = v.getUint32(p), type = fourcc(v, p + 4);
      if (size < 8) break;
      if (type === 'iinf'){
        const ver = v.getUint8(p + 8); let q = p + 12;
        const n = ver === 0 ? v.getUint16(q) : v.getUint32(q); q += ver === 0 ? 2 : 4;
        for (let i = 0; i < n && q + 8 <= p + size; i++){
          const bs = v.getUint32(q);
          if (fourcc(v, q + 4) === 'infe' && v.getUint8(q + 8) >= 2){
            const iv = v.getUint8(q + 8); let r = q + 12;
            const id = iv === 2 ? v.getUint16(r) : v.getUint32(r); r += (iv === 2 ? 2 : 4) + 2;
            if (fourcc(v, r) === 'Exif'){ exifId = id; break; }
          }
          if (bs < 8) break; q += bs;
        }
      }
      if (type === 'iloc') iloc = p;
      p += size;
    }
    if (exifId === null || iloc < 0) return null;
    const ver = v.getUint8(iloc + 8); let q = iloc + 12;
    const b1 = v.getUint8(q), b2 = v.getUint8(q + 1); q += 2;
    const offSize = b1 >> 4, lenSize = b1 & 15, baseSize = b2 >> 4, idxSize = (ver === 1 || ver === 2) ? (b2 & 15) : 0;
    const rd = n => { let x = 0; if (n === 2) x = v.getUint16(q); else if (n === 4) x = v.getUint32(q); else if (n === 8) x = Number(v.getBigUint64(q)); q += n; return x; };
    const count = ver < 2 ? v.getUint16(q) : v.getUint32(q); q += ver < 2 ? 2 : 4;
    let ext = null;
    for (let i = 0; i < count && !ext; i++){
      const id = ver < 2 ? v.getUint16(q) : v.getUint32(q); q += ver < 2 ? 2 : 4;
      let method = 0; if (ver === 1 || ver === 2){ method = v.getUint16(q) & 15; q += 2; }
      q += 2;
      const base = rd(baseSize), n = v.getUint16(q); q += 2;
      let first = null;
      for (let e = 0; e < n; e++){ if (idxSize) rd(idxSize); const off = rd(offSize), len = rd(lenSize); if (!first) first = { off: base + off, len }; }
      if (id === exifId && method === 0) ext = first;
    }
    if (!ext || !ext.len) return null;
    const ev = new DataView(await file.slice(ext.off, ext.off + Math.min(ext.len, 256 * 1024)).arrayBuffer());
    const t = 4 + ev.getUint32(0);
    return t + 8 <= ev.byteLength ? readTiff(ev, t) : null;
  } catch (e){ return null; }
}
async function readRawTiff(file){
  const v = new DataView(await file.slice(0, 1024 * 1024).arrayBuffer());
  return readTiff(v, 0);
}
// The movie header's creation time: seconds since 1904-01-01 UTC, 32 bits (version 0) or 64 (version 1). Cameras
// that never set their clock write 0 or a date in 1904, which reads as no date. (The counter's own page reads no
// date from a video; a year page needs one, or a trip filmed and not photographed would be missing from its year.)
function movieMs(txt, v){
  const i = txt.indexOf('mvhd');
  if (i < 4 || i + 16 > v.byteLength) return null;
  const ver = v.getUint8(i + 4);
  if (ver !== 0 && ver !== 1) return null;
  const secs = ver === 1 ? Number(v.getBigUint64(i + 8)) : v.getUint32(i + 8);
  return (secs - 2082844800) * 1000;
}
function movieDate(txt, v){
  const ms = movieMs(txt, v);
  const d = ms === null ? null : utcDate(ms);
  return d && d.year > 1990 ? d : null;
}
async function readVideo(file){
  const parts = [file.slice(0, 1024 * 1024)];
  if (file.size > 1024 * 1024) parts.push(file.slice(Math.max(1024 * 1024, file.size - 1024 * 1024)));
  let point = null, when = null, day = null;
  for (const part of parts){
    const buf = await part.arrayBuffer();
    const txt = new TextDecoder('latin1').decode(buf);
    if (!point){
      const m = txt.match(/([+-]\d{2}\.\d{3,})([+-]\d{3}\.\d{3,})/);
      if (m){
        const lat = +m[1], lon = +m[2];
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) point = [lon, lat];
      }
    }
    if (!when){ const dv = new DataView(buf); when = movieDate(txt, dv); if (when) day = utcDay(movieMs(txt, dv)); }
  }
  return point ? { point, year: when ? when.year : null, month: when ? when.month : null, day } : null;
}
const KIND = name => {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (/^(jpe?g|jfif)$/.test(ext)) return 'jpeg';
  if (/^(heic|heif|hif|avif)$/.test(ext)) return 'heif';
  if (/^(dng|tiff?|nef|arw|cr2|orf|rw2|pef|srw)$/.test(ext)) return 'tiff';
  if (/^(mov|mp4|m4v|3gp)$/.test(ext)) return 'video';
  if (ext === 'json') return 'json';
  return null;
};
// A photo or a video: { point: [lon, lat] | null, year, month } or null when nothing could be read.
async function readMedia(file){
  const kind = KIND(file.name);
  try {
    if (kind === 'jpeg') return await readJpeg(file);
    if (kind === 'heif') return await readHeif(file);
    if (kind === 'tiff') return await readRawTiff(file);
    if (kind === 'video') return await readVideo(file);
  } catch (e){}
  return null;
}

// ---------- Google Takeout sidecars and Timeline exports ----------
// A Google Photos sidecar (the small JSON next to each photo in a Takeout export), already parsed:
// { title, point, year, month }, or null when it is not one.
function sidecar(o){
  if (!o || !(o.geoData || o.geoDataExif) || typeof o.title !== 'string') return null;
  let point = null;
  for (const k of ['geoDataExif', 'geoData']){
    const g = o[k];
    if (g && typeof g.latitude === 'number' && typeof g.longitude === 'number' && !(g.latitude === 0 && g.longitude === 0)){ point = [g.longitude, g.latitude]; break; }
  }
  const ts = o.photoTakenTime && +o.photoTakenTime.timestamp, when = ts ? utcDate(ts * 1000) : null;
  return { title: o.title, point, year: when ? when.year : null, month: when ? when.month : null, day: when ? utcDay(ts * 1000) : null };
}
const LOC_RE = /"latitudeE7"\s*:\s*(-?\d+)\s*,\s*"longitudeE7"\s*:\s*(-?\d+)|(-?\d{1,2}(?:\.\d+)?)(?:°|\\u00b0),\s*(-?\d{1,3}(?:\.\d+)?)(?:°|\\u00b0)|geo:(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)|"(?:timestamp|startTime|endTime|time|startTimestamp|endTimestamp|creationTimestamp)"\s*:\s*"(\d{4})-(\d\d)(?:-(\d\d))?|"timestampMs"\s*:\s*"(\d{12,13})"/g;
const monthOf = s => { const m = +s; return m >= 1 && m <= 12 ? m : null; };
// Reads a Timeline export of any size in 8 MB slices. onPoint([lon, lat], year, month, day): the date is the last one
// read before the point (or, in the newer Records.json, the one written just after it), so it is the day of that
// stretch of the timeline rather than of the single point.
async function scanLocationFile(file, onPoint, onProgress){
  const CH = 8 * 1024 * 1024, OV = 512, dec = new TextDecoder();
  let pos = 0, carry = '', year = null, month = null, day = null, n = 0;
  while (pos < file.size){
    const end = Math.min(pos + CH, file.size), last = end >= file.size;
    const text = carry + dec.decode(await file.slice(pos, end).arrayBuffer(), { stream: !last });
    const cut = last ? text.length : text.length - OV;
    LOC_RE.lastIndex = 0;
    let m, lastEnd = 0;
    while ((m = LOC_RE.exec(text)) !== null){
      if (m.index >= cut) break;
      lastEnd = LOC_RE.lastIndex;
      // day: the one written in the timestamp (local time, in the on-device Timeline.json), or null.
      if (m[7]){ year = +m[7]; month = monthOf(m[8]); day = m[9] ? isoDay(year, +m[8], +m[9]) : null; continue; }
      if (m[10]){ const d = utcDate(+m[10]); year = d ? d.year : null; month = d ? d.month : null; day = d ? utcDay(+m[10]) : null; continue; }
      let lat, lon;
      if (m[1] !== undefined){
        // Newer Records.json puts the ISO timestamp after the coordinates in the same object.
        // (Older exports put "timestampMs" first; LOC_RE has already read that one.)
        const ahead = /"timestamp"\s*:\s*"(\d{4})-(\d\d)(?:-(\d\d))?/.exec(text.slice(m.index, m.index + 400));
        if (ahead){ year = +ahead[1]; month = monthOf(ahead[2]); day = ahead[3] ? isoDay(year, +ahead[2], +ahead[3]) : null; }
        lat = +m[1]; lon = +m[2];
        if (lat > 900000000) lat -= 4294967296;
        if (lon > 1800000000) lon -= 4294967296;
        lat /= 1e7; lon /= 1e7;
      } else if (m[3] !== undefined){ lat = +m[3]; lon = +m[4]; }
      else { lat = +m[5]; lon = +m[6]; }
      onPoint([lon, lat], year, month, day); n++;
    }
    // A match that started before the cut may run past it; carrying from inside it would read its tail as a new point.
    carry = last ? '' : text.slice(Math.max(cut, lastEnd));
    pos = end;
    if (onProgress) onProgress(pos / file.size);
    await tick();
  }
  return n;
}

// ---------- whole folders, dropped ----------
async function entriesToFiles(entries, onCount){
  const out = [];
  const walk = async entry => {
    if (!entry || entry.name.startsWith('.')) return;
    if (entry.isFile){ out.push(await new Promise((res, rej) => entry.file(res, rej)).catch(() => null)); return; }
    if (entry.isDirectory){
      const reader = entry.createReader();
      for (;;){
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej)).catch(() => []);
        if (!batch.length) break;
        for (const e of batch) await walk(e);
        if (onCount && out.length % 500 === 0) onCount(out.length);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out.filter(Boolean);
}

root.DriftlogScan = { KIND, locator, readMedia, readTiff, sidecar, scanLocationFile, entriesToFiles, exifDate, movieDate, exifDay, utcDay };
})(typeof window !== 'undefined' ? window : globalThis);
