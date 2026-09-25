// Driftlog Counter video: a 9:16 clip of a list of countries filling in the world map, 0 to N, made on the device.
// Needs /kit.js. The clip is encoded with WebCodecs (H.264) into an MP4 written here, no library; without WebCodecs it
// is recorded from the canvas with MediaRecorder; with neither, the last frame is saved as a 9:16 image. Nothing is
// sent anywhere. Nothing runs against the page when it loads: panel() takes a container. counter-tools/DESIGN-share.md, 10.
(function (root){
'use strict';
const Kit = root.DriftlogKit;

// ---------- the clip: 1080 × 1920, 30 fps, 6–15 s, silent ----------
// Everything that has to be read sits inside SAFE: TikTok and Instagram Reels lay their tabs over the top ~250 px,
// the caption and account over the bottom ~440 px and a column of buttons down the right from about y = 1000, so
// the map goes above that column (y 300–858) and the text below it stays within x 140–940.
const VIDEO = { W: 1080, H: 1920, FPS: 30, MAP: { x: 0, y: 300, w: 1080, h: 558 }, SAFE: { top: 260, bottom: 1480, left: 140, right: 940 } };
const INTRO = 0.5, HOLD = 1.0, OUTRO = 2.0;        // seconds: the empty map, the full map, the address at the end
const FLASH = 0.4, PULSE = 0.7, FADE = 0.35;       // a new country is lighter for FLASH s; its ring lasts PULSE s
const NOTE = '194 = 193 UN members + Taiwan';
const ADDRESS = 'driftlog-counter.pages.dev';
const FLASH_COLORS = ['#F29B5C', '#D6692E'];
const FONTS = ['600 230px Fraunces', '300 44px Inter', '600 32px Inter', '500 40px Inter', '300 30px Inter', '400 32px Inter', '500 28px Inter', '600 64px Inter'];

// The line under the count, split as on the result image (Kit.CAPTIONS) but without "in my own browser", which would
// have to shrink to ~22 px to fit: "photos" only when the list was counted from photos, picked by hand says so, an
// edited list says what it was counted from (base) when known. Unknown source (a list from a copied address): nothing.
const FROM = { photos: 'photos', timeline: 'location history', both: 'photos and location history' };
function videoCaption(src, base){
  if (src === 'tap') return 'picked by hand';
  if (src === 'edited') return `counted from my own ${FROM[base] || 'files'}, then edited by hand`;
  return FROM[src] ? `counted from my own ${FROM[src]}` : '';
}

// list: { codes, years (Map | null), src, base, hits (Map featureIndex -> Set of polygons, from a photo count; or null) }.
// The order is Kit.revealOrder: first-visit year, then region, then name. Years only set the order and are never drawn
// (as on the passport page: a year says more about someone's life than the list does). More countries, a longer clip.
function plan(list){
  const order = Kit.revealOrder(list.codes, list.years), n = order.length;
  const reveal = 2.5 + 9 * (1 - Math.exp(-Math.max(0, n - 1) / 45));
  const frames = Math.ceil((INTRO + reveal + HOLD + OUTRO) * VIDEO.FPS), duration = frames / VIDEO.FPS;
  // Slow at first, then quicker: country i appears at `at[i]` seconds (the gaps shrink to 0.8 × reveal / n at the end).
  const at = order.map((c, i) => INTRO + reveal * Math.pow((i + 0.5) / n, 0.8));
  // The name under the map changes at most about every 0.3 s, even at the quickest; with many countries only every
  // `step`-th one is named.
  const step = Math.max(1, Math.ceil(0.3 * n / (0.8 * reveal)));
  const dated = !!(list.years && order.some(c => list.years.get(c)));
  return { n, order, at, step, dated, frames, duration, holdAt: INTRO + reveal, outroAt: duration - OUTRO,
    src: list.src || null, base: list.base || null, hits: list.hits || null, caption: videoCaption(list.src, list.base) };
}
// What the frame at t seconds says. outro: 0 before the end card, rising to 1 as it fades in.
function textAt(p, t){
  let k = 0;
  while (k < p.n && p.at[k] <= t) k++;
  const named = k && t < p.holdAt ? p.order[(k - 1) - ((k - 1) % p.step)] : null;
  return { count: k, label: named ? Kit.nameOf(named) : '', caption: p.caption, note: NOTE, address: ADDRESS,
    outro: t < p.outroAt ? 0 : Math.min(1, (t - p.outroAt) / FADE) };
}

// ---------- drawing ----------
const PAD = 24;                                     // room around the map layer for the dots of tiny places
// The drawing state: the plain land plus every country already settled, on one layer canvas (painted once, never
// again), where each country's pulse starts, and how far the layer has got. layer: a canvas to use (tests), or made here.
function scene(FEATS, p, layer){
  const { MAP } = VIDEO;
  layer = layer || document.createElement('canvas');
  layer.width = MAP.w; layer.height = MAP.h + 2 * PAD;
  const box = { x: 0, y: PAD, w: MAP.w, h: MAP.h };
  Kit.drawWorld(layer.getContext('2d'), FEATS, box, null);
  const featsOf = new Map();
  FEATS.forEach((f, fi) => { if (f.k && f.a) featsOf.set(f.a, (featsOf.get(f.a) || []).concat(fi)); });
  // Each country's features and the polygons to paint: those a photo landed in when known (the result image's rule),
  // otherwise the whole country (Kit.layers keeps France to the part near Paris).
  const hitsOf = code => {
    const all = featsOf.get(code) || [], own = p.hits ? all.filter(fi => p.hits.has(fi)) : [];
    return new Map((own.length ? own : all).map(fi => [fi, own.length && p.hits.get(fi) && p.hits.get(fi).size ? p.hits.get(fi) : null]));
  };
  const project = (lon, lat) => [MAP.x + (lon + 180) / 360 * MAP.w, MAP.y + (85 - Math.max(lat, -60)) / 145 * MAP.h];
  const area = b => (b[2] - b[0]) * (b[3] - b[1]);
  // Where the ring starts: the middle of the biggest part painted. A country whose painted parts all fit in TINY px
  // (Cyprus, Singapore, Lebanon, Jamaica...) would be a speck on a phone, so it also gets a dot of its own.
  const place = code => {
    let best = null, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [fi, set] of hitsOf(code)){
      const f = FEATS[fi], lay = Kit.layers(FEATS, new Map([[fi, set]]))(fi);
      f.pb.forEach((b, pi) => {
        if (!lay.on(pi)) return;
        if (!best || area(b) > area(best)) best = b;
        const [a, c] = project(b[0], b[3]), [d, e] = project(b[2], b[1]);
        x0 = Math.min(x0, a); y0 = Math.min(y0, c); x1 = Math.max(x1, d); y1 = Math.max(y1, e);
      });
    }
    const at = best ? project((best[0] + best[2]) / 2, (best[1] + best[3]) / 2) : [VIDEO.W / 2, MAP.y + MAP.h / 2];
    return { at, tiny: !!best && x1 - x0 < TINY && y1 - y0 < TINY };
  };
  const places = p.order.map(place);
  return { p, FEATS, layer, box, settled: 0, hitsOf, anchors: places.map(q => q.at), tiny: places.map(q => q.tiny) };
}
const TINY = 14;
function dot(c, x, y, color){
  c.globalAlpha = 0.28; c.fillStyle = color; c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1; c.beginPath(); c.arc(x, y, 6.5, 0, Math.PI * 2); c.fill();
}
const spaced = (c, px) => { if ('letterSpacing' in c) c.letterSpacing = px; };
function fit(c, str, weight, px, family, maxW){ do { c.font = `${weight} ${px}px ${family}`; } while (c.measureText(str).width > maxW && --px > 10); return px; }
// Draws the frame at t seconds onto c (a 1080 × 1920 context). Frames must come in order of t (the layer only grows).
// Returns what it wrote, for the tests.
function drawFrame(c, s, t){
  const { W, H, MAP, SAFE } = VIDEO, p = s.p, x = textAt(p, t), CX = W / 2, maxW = SAFE.right - SAFE.left;
  while (s.settled < x.count && p.at[s.settled] + FLASH <= t){   // done flashing: onto the layer, for good
    const i = s.settled, lc = s.layer.getContext('2d');
    Kit.drawWorld(lc, s.FEATS, s.box, Kit.layers(s.FEATS, s.hitsOf(p.order[i])), { paintedOnly: true });
    if (s.tiny[i]) dot(lc, s.anchors[i][0] - MAP.x, s.anchors[i][1] - MAP.y + PAD, Kit.COLORS.mine[0]);
    s.settled++;
  }
  c.globalAlpha = 1;
  c.fillStyle = '#FCF7F0'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#FDF6EE'; c.fillRect(0, MAP.y - 40, W, MAP.h + 80);
  c.drawImage(s.layer, MAP.x, MAP.y - PAD);
  if (x.count > s.settled){                        // the newest few, lighter until they settle
    const fresh = new Map();
    for (let i = s.settled; i < x.count; i++) for (const [fi, set] of s.hitsOf(p.order[i])) fresh.set(fi, set);
    Kit.drawWorld(c, s.FEATS, MAP, Kit.layers(s.FEATS, fresh, () => FLASH_COLORS), { paintedOnly: true });
    for (let i = s.settled; i < x.count; i++) if (s.tiny[i]) dot(c, s.anchors[i][0], s.anchors[i][1], FLASH_COLORS[0]);
  }
  c.strokeStyle = '#D6692E';
  for (let i = 0; i < x.count; i++){               // a ring where each country appeared, so tiny ones are seen too
    const q = (t - p.at[i]) / PULSE;
    if (q >= 1) continue;
    c.globalAlpha = 0.6 * (1 - q); c.lineWidth = 5 - 3 * q;
    c.beginPath(); c.arc(s.anchors[i][0], s.anchors[i][1], 12 + 52 * (1 - (1 - q) * (1 - q)), 0, Math.PI * 2); c.stroke();
  }
  c.globalAlpha = 1;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const drawn = [];
  const text = (str, y, color, alpha) => { if (!str || alpha <= 0) return; c.globalAlpha = alpha; c.fillStyle = color; c.fillText(str, CX, y); drawn.push({ str, y, font: c.font, alpha }); };
  c.font = '600 32px Inter, sans-serif'; spaced(c, '8px');
  text('I HAVE BEEN TO', 985, '#D6692E', 1);
  spaced(c, '0px');
  c.font = '600 230px Fraunces, Georgia, serif';
  text(String(x.count), 1205, '#322014', 1);
  c.font = '300 44px Inter, sans-serif';
  text('of 194 countries', 1270, '#7A6555', 1);
  fit(c, x.label, 500, 40, 'Inter, sans-serif', maxW);
  text(x.label, 1340, '#322014', 1 - x.outro);
  fit(c, x.note, 400, 32, 'Inter, sans-serif', maxW);
  text(x.note, 1340, '#7A6555', x.outro);
  fit(c, x.caption, 300, 30, 'Inter, sans-serif', maxW);
  text(x.caption, 1386, '#7A6555', 1);
  c.font = '500 28px Inter, sans-serif';
  text(x.address, 1460, '#8F7765', 1 - x.outro);
  fit(c, x.address, 600, 64, 'Inter, sans-serif', maxW);
  text(x.address, 1460, '#B9561F', x.outro);
  c.globalAlpha = 1;
  return Object.assign(x, { drawn });
}

// ---------- MP4 (ISO BMFF): one H.264 track, written here ----------
// ftyp, then moov (so a player can start before the end), then mdat with every frame in one chunk. Samples come in
// decode order; if an encoder reorders frames (B-frames), ctts and an edit list put them back in presentation order.
const n32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
const n16 = n => [n >>> 8 & 255, n & 255];
const ascii = s => [...s].map(ch => ch.charCodeAt(0));
const zeros = n => new Array(n).fill(0);
function flat(parts){
  let len = 0;
  for (const q of parts) len += q.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const q of parts){ out.set(q, o); o += q.length; }
  return out;
}
const box = (type, ...parts) => { const body = flat(parts); return flat([n32(8 + body.length), ascii(type), body]); };
const full = (type, version, flags, ...parts) => box(type, [version, flags >>> 16 & 255, flags >>> 8 & 255, flags & 255], ...parts);
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(n32);
const bytes = b => b instanceof ArrayBuffer ? new Uint8Array(b.slice(0)) : new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
// Length-prefixed NAL units (what an 'avc1' track holds) fill the sample exactly; Annex B (start codes) does not.
function isAvcc(b){
  let i = 0;
  while (i + 4 <= b.length){ const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0; if (!len) return false; i += 4 + len; }
  return i === b.length && b.length > 0;
}
function annexB(b){
  const out = [];
  let start = -1, i = 0;
  while (i + 2 < b.length){
    if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1){ if (start >= 0) out.push(b.subarray(start, i > 0 && b[i - 1] === 0 ? i - 1 : i)); i += 3; start = i; }
    else i++;
  }
  if (start >= 0) out.push(b.subarray(start));
  return out.filter(u => u.length);
}
// Some encoders hand over Annex B, or no avcC: rebuild both from the stream's own SPS and PPS.
function fromAnnexB(chunks, avcC){
  let sps = null, pps = null;
  const samples = chunks.map(ch => {
    const units = annexB(ch.data), keep = [];
    for (const u of units){
      const type = u[0] & 31;
      if (type === 7){ sps = sps || u; continue; }
      if (type === 8){ pps = pps || u; continue; }
      if (type === 9) continue;                    // access unit delimiter
      keep.push(n32(u.length), u);
    }
    return Object.assign({}, ch, { data: flat(keep) });
  });
  if (!avcC){
    if (!sps || !pps) throw new Error('The encoder gave no H.264 parameter sets.');
    const high = [100, 110, 122, 144].includes(sps[1]);   // 4:2:0, 8-bit: what browsers encode
    avcC = flat([[1, sps[1], sps[2], sps[3], 0xFF, 0xE1], n16(sps.length), sps, [1], n16(pps.length), pps, high ? [0xFD, 0xF8, 0xF8, 0] : []]);
  }
  return { samples, avcC };
}
// VideoColorSpace names -> ISO/IEC 23091-2 codes, for the colr box. Anything else: no colr, the player's default.
const CICP = {
  primaries: { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 },
  transfer: { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13, pq: 16, hlg: 18 },
  matrix: { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 },
};
// chunks: [{ data: Uint8Array, key: bool, ts: presentation time in µs }] in decode order. Returns a Blob (video/mp4).
function mp4(chunks, { width, height, fps, avcC, colorSpace }){
  if (!chunks.length) throw new Error('No frames were encoded.');
  let samples = chunks;
  if (!avcC || !chunks.every(ch => isAvcc(ch.data))) ({ samples, avcC } = fromAnnexB(chunks, avcC));
  const scale = fps * 1000, frame = 1000;          // media timescale: one frame = 1000 ticks
  const pts = samples.map(s => Math.round(s.ts * scale / 1e6)), sorted = pts.slice().sort((a, b) => a - b);
  let shift = 0;
  pts.forEach((v, i) => { shift = Math.max(shift, sorted[i] - v); });
  const dts = sorted.map(v => v - sorted[0]);
  const runs = arr => arr.reduce((r, v) => { const l = r[r.length - 1]; if (l && l[1] === v) l[0]++; else r.push([1, v]); return r; }, []);
  const stts = runs(dts.map((v, i) => i + 1 < dts.length ? dts[i + 1] - v : frame));
  const ctts = shift ? runs(pts.map((v, i) => v - sorted[0] - dts[i] + shift)) : null;
  const keys = [];
  samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
  const mediaDur = dts[dts.length - 1] + frame, movieDur = Math.round(mediaDur * 1000 / scale);
  const cs = colorSpace || {}, cp = CICP.primaries[cs.primaries], ct = CICP.transfer[cs.transfer], cm = CICP.matrix[cs.matrix];
  const colr = cp !== undefined && ct !== undefined && cm !== undefined ? box('colr', ascii('nclx'), n16(cp), n16(ct), n16(cm), [cs.fullRange ? 0x80 : 0]) : [];
  const avc1 = box('avc1', zeros(6), n16(1), zeros(16), n16(width), n16(height), n32(0x480000), n32(0x480000), n32(0), n16(1), zeros(32),
    n16(0x18), n16(0xFFFF), box('avcC', avcC), colr, box('pasp', n32(1), n32(1)));
  const ftyp = box('ftyp', ascii('isom'), n32(0x200), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));
  const moov = offset => box('moov',
    full('mvhd', 0, 0, n32(0), n32(0), n32(1000), n32(movieDur), n32(0x10000), n16(0x100), zeros(10), MATRIX, zeros(24), n32(2)),
    box('trak',
      full('tkhd', 0, 3, n32(0), n32(0), n32(1), n32(0), n32(movieDur), zeros(8), n16(0), n16(0), n16(0), n16(0), MATRIX, n32(width * 65536), n32(height * 65536)),
      shift ? box('edts', full('elst', 0, 0, n32(1), n32(movieDur), n32(shift), n16(1), n16(0))) : [],
      box('mdia',
        full('mdhd', 0, 0, n32(0), n32(0), n32(scale), n32(mediaDur), n16(0x55C4), n16(0)),   // language: und
        full('hdlr', 0, 0, n32(0), ascii('vide'), zeros(12), ascii('VideoHandler'), [0]),
        box('minf',
          full('vmhd', 0, 1, zeros(8)),
          box('dinf', full('dref', 0, 0, n32(1), full('url ', 0, 1))),
          box('stbl',
            full('stsd', 0, 0, n32(1), avc1),
            full('stts', 0, 0, n32(stts.length), ...stts.map(([k, d]) => n32(k).concat(n32(d)))),
            ctts ? full('ctts', 0, 0, n32(ctts.length), ...ctts.map(([k, d]) => n32(k).concat(n32(d)))) : [],
            keys.length < samples.length ? full('stss', 0, 0, n32(keys.length), ...keys.map(n32)) : [],
            full('stsz', 0, 0, n32(0), n32(samples.length), ...samples.map(s => n32(s.data.length))),
            full('stsc', 0, 0, n32(1), n32(1), n32(samples.length), n32(1)),
            full('stco', 0, 0, n32(1), n32(offset)))))));
  let total = 0;
  for (const s of samples) total += s.data.length;
  if (total + 8 > 0xFFFFFFFF) throw new Error('The video is too large.');
  const head = ftyp.length + moov(0).length + 8;   // the moov's size does not depend on the offset it holds
  return new Blob([ftyp, moov(head), flat([n32(8 + total), ascii('mdat')]), ...samples.map(s => s.data)], { type: 'video/mp4' });
}

// ---------- making it: WebCodecs, else MediaRecorder, else one image ----------
const ABORT = { aborted: true };                    // thrown when the list changed while a clip was being made
const wait = ms => new Promise(r => setTimeout(r, ms));
// An encoder can stop without an error: frames go in and nothing comes out, or flush() never settles. After this long
// with nothing back (ms), it counts as failed and make() tries the next route. Tests shorten them.
const LIMITS = { stall: 5000, flush: 10000 };
// p, failing with message if it has not settled within ms. p may still settle later; nothing listens then.
function within(p, ms, message){
  let timer;
  return Promise.race([p, new Promise((res, rej) => { timer = setTimeout(() => rej(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
// Level 4.0 is the lowest that holds 1080 × 1920; High, then Main, then Baseline.
const H264 = ['avc1.640028', 'avc1.4d0028', 'avc1.420028', 'avc1.640032'];
async function h264Config(){
  if (typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function') return null;
  for (const codec of H264){
    const cfg = { codec, width: VIDEO.W, height: VIDEO.H, bitrate: 8e6, framerate: VIDEO.FPS, avc: { format: 'avc' } };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e){}
  }
  return null;
}
// MP4 first (Instagram and TikTok take it; Safari and recent Chrome record it), WebM otherwise (Firefox).
const RECORDER_TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
function recorderType(canvas){
  if (typeof MediaRecorder !== 'function' || !canvas || typeof canvas.captureStream !== 'function') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';        // the browser's own default
  return RECORDER_TYPES.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e){ return false; } }) || null;
}
// The ways this browser can make the clip, best first. The image always works.
async function routes(canvas){
  const out = [], cfg = await h264Config(), type = recorderType(canvas);
  if (cfg) out.push({ kind: 'webcodecs', cfg });
  if (type !== null) out.push({ kind: 'recorder', type });
  out.push({ kind: 'still' });
  return out;
}
// Faster than real time: each frame is drawn, handed to the encoder and dropped.
async function encodeH264(canvas, s, cfg, tick){
  const p = s.p, c = canvas.getContext('2d'), chunks = [];
  // idle: ms spent waiting on a full queue since the last frame came out. Each wait counts for at most 50 ms, so a tab
  // that was suspended in the background (iOS) does not look like a stuck encoder when it comes back.
  let avcC = null, colorSpace = null, failed = null, idle = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      idle = 0;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, key: chunk.type === 'key', ts: chunk.timestamp });
      const dc = meta && meta.decoderConfig;
      if (dc && dc.description && !avcC) avcC = bytes(dc.description);
      if (dc && dc.colorSpace && !colorSpace) colorSpace = dc.colorSpace;
    },
    error: e => { failed = e || new Error('The video encoder stopped.'); },
  });
  try {
    encoder.configure(cfg);
    const us = 1e6 / VIDEO.FPS;
    for (let i = 0; i < p.frames; i++){
      if (failed) throw failed;
      if (!tick(i / p.frames)) throw ABORT;
      drawFrame(c, s, i / VIDEO.FPS);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * us), duration: Math.round(us) });
      encoder.encode(frame, { keyFrame: i % (VIDEO.FPS * 2) === 0 });   // a key frame every 2 s, for editors
      frame.close();
      while (encoder.encodeQueueSize > 3 && !failed){
        if (idle > LIMITS.stall) throw new Error('The video encoder stopped responding.');
        const t = Date.now();
        await wait(4);
        idle += Math.min(Date.now() - t, 50);
      }
      if (i % 5 === 4) await wait(0);                                    // let the page show the progress
    }
    await within(encoder.flush(), LIMITS.flush, 'The video encoder did not finish.');
    if (failed) throw failed;
  } finally { if (encoder.state !== 'closed') try { encoder.close(); } catch (e){} }
  return mp4(chunks, { width: VIDEO.W, height: VIDEO.H, fps: VIDEO.FPS, avcC, colorSpace });
}
// Real time: the canvas is recorded while it animates, so it takes as long as the clip. A hidden tab pauses drawing.
async function record(canvas, s, type, tick){
  const p = s.p, c = canvas.getContext('2d');
  const stream = canvas.captureStream(VIDEO.FPS);
  const rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8e6 } : { videoBitsPerSecond: 8e6 });
  const parts = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
  const stopped = new Promise((res, rej) => { rec.onstop = res; rec.onerror = e => rej((e && e.error) || new Error('Recording failed.')); });
  stopped.catch(() => {});                         // awaited below; this only keeps an early error from being "unhandled"
  const next = f => typeof requestAnimationFrame === 'function' && document.visibilityState !== 'hidden' ? requestAnimationFrame(f) : setTimeout(f, 1000 / VIDEO.FPS);
  drawFrame(c, s, 0);
  rec.start(500);
  const t0 = performance.now();
  let aborted = false;
  await new Promise(res => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if (!tick(Math.min(1, t / p.duration), p.duration - t)){ aborted = true; return res(); }
      if (t >= p.duration) return res();
      drawFrame(c, s, t);
      next(step);
    };
    next(step);
  });
  drawFrame(c, s, p.duration);                     // the end card, held for two frames so it is in the file
  await wait(2000 / VIDEO.FPS);
  rec.stop();
  stream.getTracks().forEach(tr => tr.stop());
  await stopped;
  if (aborted) throw ABORT;
  return new Blob(parts, { type: (rec.mimeType || type || 'video/webm').split(';')[0] });
}
function still(canvas, s){
  drawFrame(canvas.getContext('2d'), s, s.p.duration);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('The image could not be made.')), 'image/png'));
}
// Makes the clip on canvas (1080 × 1920), trying each route in turn if one fails. tick(fraction, secondsLeft) is
// called along the way and returns false to stop. Resolves to { blob, route: 'webcodecs' | 'recorder' | 'still', type }.
async function make(canvas, FEATS, list, tick){
  const p = plan(list), all = await routes(canvas);
  let last = null;
  for (const r of all){
    const s = scene(FEATS, p);
    try {
      const blob = r.kind === 'webcodecs' ? await encodeH264(canvas, s, r.cfg, (f, left) => tick(f, left, r.kind))
        : r.kind === 'recorder' ? await record(canvas, s, r.type, (f, left) => tick(f, left, r.kind))
        : await still(canvas, s);
      return { blob, route: r.kind, type: blob.type || (r.kind === 'still' ? 'image/png' : 'video/mp4'), plan: p };
    } catch (e){
      if (e === ABORT) throw e;
      last = e;
    } finally { s.layer.width = s.layer.height = 0; }   // hand the layer's memory back straight away
  }
  throw last || new Error('The video could not be made.');
}

// ---------- the panel: "Save video", then the clip with Share and Download ----------
const CSS = `
.vk{text-align:center;margin-top:16px}
.vk [hidden]{display:none!important}
.vk-row span{display:block;font-size:13px;color:var(--muted2,#7D6656);margin:8px auto 0;max-width:520px}
.vk-out{margin-top:14px}
.vk-status{font-size:14px;color:var(--muted,#7A6555);min-height:22px}
.vk-bar{height:4px;background:var(--line,#EAD9C9);border-radius:4px;overflow:hidden;max-width:280px;margin:8px auto 0}
.vk-bar i{display:block;height:100%;width:0;background:var(--accent,#D6692E)}
.vk-stage canvas,.vk-stage video{display:block;width:min(100%,270px);height:auto;aspect-ratio:9/16;margin:14px auto 0;border-radius:14px;
  border:1px solid var(--line,#EAD9C9);background:#FCF7F0;box-shadow:0 10px 28px rgba(50,32,20,.10)}
.vk-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.vk-route{font-size:12.5px;color:var(--muted2,#7D6656);margin:12px auto 0;max-width:520px}
`;
function injectCss(){
  if (document.getElementById('vk-css')) return;
  const st = document.createElement('style');
  st.id = 'vk-css'; st.textContent = CSS;
  document.head.appendChild(st);
}
const ROUTE_NOTE = {
  webcodecs: () => 'Made on this device with WebCodecs: H.264 video in an MP4 file. Nothing was uploaded.',
  recorder: type => /mp4/.test(type) ? 'Made on this device by recording the map as it filled in (MediaRecorder, MP4). Nothing was uploaded.'
    : 'Made on this device by recording the map as it filled in (MediaRecorder, WebM). Instagram and TikTok may not take WebM files. Nothing was uploaded.',
  still: () => 'This browser can’t make video here, so this is the last frame as a 9:16 image (PNG). Nothing was uploaded.',
};
// Renders into host. opts.feats(): a promise of the decoded borders (Kit.decodeFeats). set(list) shows what the clip
// will be for a list (null: nothing to make) and drops a clip made for an earlier list.
function panel(host, opts){
  injectCss();
  host.innerHTML = `<div class="vk">
    <p class="vk-row"><button type="button" class="btn vk-make">Save video</button><span class="vk-sub"></span></p>
    <div class="vk-out" hidden>
      <p class="vk-status" role="status" aria-live="polite"></p>
      <div class="vk-bar"><i></i></div>
      <div class="vk-stage"></div>
      <div class="vk-btns"><button type="button" class="btn primary vk-share" hidden>Share video</button><button type="button" class="btn vk-dl" hidden>Download</button></div>
      <p class="vk-route"></p>
    </div>
  </div>`;
  const q = sel => host.querySelector(sel);
  const makeBtn = q('.vk-make'), out = q('.vk-out'), status = q('.vk-status'), bar = q('.vk-bar'), fill = q('.vk-bar i'), stage = q('.vk-stage');
  const shareBtn = q('.vk-share'), dlBtn = q('.vk-dl'), routeEl = q('.vk-route');
  let list = null, gen = 0, made = null, busy = false;
  const clear = () => {
    if (made && made.url) try { URL.revokeObjectURL(made.url); } catch (e){}
    made = null; stage.innerHTML = ''; out.hidden = true; shareBtn.hidden = true; dlBtn.hidden = true; routeEl.textContent = ''; status.textContent = '';
  };
  const describe = l => {
    const p = plan(l), secs = Math.round(p.duration);
    return `A 9:16 clip for Reels, TikTok or Stories: your map filling in, 0 to ${p.n}, ${p.dated ? 'in order of first visit' : 'region by region'}. `
      + `${secs} seconds, no sound.${p.caption ? ` It says “${p.caption}”.` : ''} Made on this device.`;
  };
  function set(l){
    gen++; busy = false; clear();
    list = l && l.codes && Kit.countOf(l.codes) ? l : null;
    makeBtn.disabled = false; makeBtn.textContent = 'Save video'; makeBtn.hidden = false;
    q('.vk-sub').textContent = list ? describe(list) : '';
  }
  const nameOf = type => /mp4/.test(type) ? 'my-countries.mp4' : /webm/.test(type) ? 'my-countries.webm' : 'my-countries-9x16.png';
  const shareText = n => `I have been to ${n} of 194 countries. Count yours: ${Kit.SITE}/`;
  const canShareFile = file => { try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e){ return false; } };
  function download(){
    if (!made) return;
    const a = document.createElement('a');
    a.download = made.file.name; a.href = made.url;
    document.body.appendChild(a); a.click(); a.remove();
  }
  // iOS opens the share sheet only from a tap, so the file is ready before the button shows.
  async function shareIt(){
    if (!made) return;
    if (canShareFile(made.file)){
      try { await navigator.share({ files: [made.file], text: shareText(made.plan.n) }); return; }
      catch (e){ if (e && e.name === 'AbortError') return; }
    }
    download();
  }
  async function start(){
    if (!list || busy) return;
    const g = ++gen, l = list;
    busy = true; clear();
    makeBtn.disabled = true; makeBtn.textContent = 'Making the video…';
    out.hidden = false; bar.hidden = false; fill.style.width = '0%';
    status.textContent = 'Getting the map ready…';
    const canvas = document.createElement('canvas');
    canvas.width = VIDEO.W; canvas.height = VIDEO.H;
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);
    try {
      const FEATS = await opts.feats().catch(() => { throw new Error('the world map did not load. Check the connection and try again.'); });
      if (document.fonts && document.fonts.load) await Promise.all(FONTS.map(f => document.fonts.load(f))).catch(() => {});
      if (g !== gen) return;
      const res = await make(canvas, FEATS, l, (f, left, kind) => {
        if (g !== gen) return false;
        fill.style.width = Math.round(f * 100) + '%';
        status.textContent = kind === 'recorder' ? `Recording in real time… ${Math.max(0, Math.ceil(left))} s left. Keep this tab open.` : `Making the video… ${Math.round(f * 100)}%`;
        return true;
      });
      if (g !== gen) return;
      const file = new File([res.blob], nameOf(res.type), { type: res.type });
      made = { file, url: URL.createObjectURL(res.blob), route: res.route, plan: res.plan };
      if (res.route !== 'still'){
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.controls = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
        v.setAttribute('aria-label', `Your video: the map filling in, 0 to ${res.plan.n} of 194 countries`);
        if (!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) v.autoplay = true;
        v.src = made.url;
        stage.innerHTML = ''; stage.appendChild(v);
        canvas.width = canvas.height = 0;            // hand the drawing memory back (iOS keeps canvases on a tight budget)
      } else {                                       // the image: the canvas already shows it
        canvas.removeAttribute('aria-hidden');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `The last frame: ${res.plan.n} of 194 countries`);
      }
      const kind = res.route === 'still' ? 'image' : 'video';
      const sharable = canShareFile(file);
      shareBtn.hidden = !sharable; shareBtn.textContent = `Share ${kind}`;
      dlBtn.hidden = false; dlBtn.textContent = sharable ? 'Download' : `Download ${kind}`;
      dlBtn.classList.toggle('primary', !sharable);
      routeEl.textContent = ROUTE_NOTE[res.route](res.type);
      status.textContent = ''; bar.hidden = true;
      makeBtn.hidden = true;
      (sharable ? shareBtn : dlBtn).focus({ preventScroll: true });   // the button that was pressed is gone
    } catch (e){
      if (e === ABORT || g !== gen) return;
      stage.innerHTML = '';
      status.textContent = e && e.message ? `The video could not be made: ${e.message}` : 'The video could not be made.';
      bar.hidden = true;
      makeBtn.disabled = false; makeBtn.textContent = 'Try again';
    } finally {
      if (g !== gen || !made) canvas.width = canvas.height = 0;   // failed, or a newer list came in: this canvas is done
      if (g === gen) busy = false;
    }
  }
  makeBtn.addEventListener('click', start);
  shareBtn.addEventListener('click', shareIt);
  dlBtn.addEventListener('click', download);
  set(null);
  return { set, get list(){ return list; }, get made(){ return made; }, get busy(){ return busy; } };
}

root.DriftlogVideo = { VIDEO, NOTE, ADDRESS, FONTS, LIMITS, plan, textAt, videoCaption, scene, drawFrame, mp4, fromAnnexB, isAvcc, routes, make, panel };
})(typeof window !== 'undefined' ? window : globalThis);
