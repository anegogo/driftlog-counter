// The 9:16 video (/video.js): the plan (length, order, what each frame says), the drawing (on a canvas that records
// what is drawn), the MP4 writer (read back box by box here and, when ffmpeg is installed, decoded by ffmpeg), the
// choice of route, and the "Save video" panels on the counter and the passport page. `node tests/video.mjs`.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { ROOT, loadPage, kitSource, videoSource } from './harness.mjs';

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const sleep = ms => new Promise(res => setTimeout(res, ms));
let seed = 20260926;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const { Kit, Video: V } = loadPage();
const ALL = Kit.COUNTRIES.map(c => c.code);
const pick = n => { const a = ALL.slice(); for (let i = a.length - 1; i > 0; i--){ const j = (rand() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return new Set(a.slice(0, n)); };
const FEATS = Kit.decodeFeats(JSON.parse(readFileSync(join(ROOT, 'countries50.json'), 'utf8')));
const { W, H, FPS, MAP, SAFE } = V.VIDEO;

// 1. The plan: 6–15 s at 30 fps, every country in before the full map holds, the address at the end, the count
// reaching N, names that change no faster than about every 0.2 s, and never a year on screen.
for (const n of [1, 3, 37, 100, 194]){
  const codes = n === 194 ? new Set(ALL) : pick(n), years = new Map([...codes].filter(() => rand() < 0.8).map(c => [c, 1990 + ((rand() * 36) | 0)]));
  const p = V.plan({ codes, years, src: 'photos' });
  check(p.duration >= 6 && p.duration <= 15 && Number.isInteger(p.frames) && Math.abs(p.frames - p.duration * FPS) < 1e-9, `${n}: ${p.frames} frames, ${p.duration.toFixed(2)} s`);
  check(p.order.join() === Kit.revealOrder(codes, years).join() && p.n === n, `${n}: countries in Kit.revealOrder (first year, region, name)`);
  check(p.at.every((t, i) => t > 0 && (i === 0 || t > p.at[i - 1]) && t < p.holdAt) && p.holdAt + 1 <= p.outroAt + 1e-9 && Math.abs(p.duration - p.outroAt - 2) < 1e-9,
    `${n}: every country appears before the full map holds, and the last 2 s are the end card`);
  const frames = [...Array(p.frames).keys()].map(i => V.textAt(p, i / FPS));
  check(frames[0].count === 0 && frames[frames.length - 1].count === n && frames.every((f, i) => !i || f.count >= frames[i - 1].count), `${n}: the count goes 0 → ${n} and never back`);
  check(frames.every(f => !/\b(19|20)\d\d\b/.test(f.label)), `${n}: no year is ever shown`);
  let lastChange = -1, fastest = Infinity;
  frames.forEach((f, i) => { if (i && f.label && f.label !== frames[i - 1].label){ if (lastChange >= 0) fastest = Math.min(fastest, (i - lastChange) / FPS); lastChange = i; } });
  check(fastest >= 0.2 - 1e-9, `${n}: names under the map change at most every ${fastest.toFixed(2)} s`);
  const end = V.textAt(p, p.duration - 1 / FPS);
  check(end.outro === 1 && end.count === n && end.note === '194 = 193 UN members + Taiwan' && end.address === 'counter.getdriftlog.com' && !end.label, `${n}: the end card`);
}
check(Math.round(V.plan({ codes: pick(3) }).duration) === 6 && Math.round(V.plan({ codes: new Set(ALL) }).duration) === 15, 'longer with more countries: 3 → 6 s, 194 → 15 s');
console.log('clip lengths: ' + [1, 3, 37, 100, 194].map(n => `${n} → ${V.plan({ codes: n === 194 ? new Set(ALL) : pick(n) }).frames} frames`).join(', '));

// 2. The caption: as on the result image. "photos" only for a list counted from photos; picked by hand says so.
const CAP = { photos: 'counted from my own photos', timeline: 'counted from my own location history', both: 'counted from my own photos and location history', tap: 'picked by hand' };
for (const [src, want] of Object.entries(CAP)) check(V.videoCaption(src) === want && V.plan({ codes: pick(5), src }).caption === want, `caption for ${src}: "${V.videoCaption(src)}"`);
check(['photos', 'timeline', 'both'].every(k => Kit.CAPTIONS[k] === V.videoCaption(k) + ', in my own browser'), 'the result image\'s words, less "in my own browser"');
check(V.videoCaption('edited', 'photos') === 'counted from my own photos, then edited by hand' && V.videoCaption('edited', 'timeline') === 'counted from my own location history, then edited by hand'
  && V.videoCaption('edited') === 'counted from my own files, then edited by hand', 'edited: says what it was counted from');
check(!/photo/.test(V.videoCaption('tap')) && !/photo/.test(V.videoCaption('timeline')) && !/photo/.test(V.videoCaption('edited', 'timeline')), 'no "photos" for a pick, a Timeline file or an edited Timeline count');
check(V.videoCaption(null) === '' && V.videoCaption('example') === '' && V.videoCaption('<b>') === '', 'unknown source: no caption at all');

// 3. The drawing, on canvases that record every call. The texts, their sizes and places (inside the part of the
// frame TikTok and Instagram leave clear), the rings, and every country ending up painted on the map layer.
function recorder(w, h){
  const calls = [], props = { font: '10px sans-serif' }, KEEP = new Set(['fillText', 'arc', 'drawImage', 'fill']);   // not every path point
  const ctx = new Proxy(props, {
    get(t, k){
      if (k in t) return t[k];
      if (k === 'measureText') return s => ({ width: String(s).length * parseFloat(/(\d+)px/.exec(t.font)[1]) * 0.55 });
      return (...a) => { if (KEEP.has(k)) calls.push([k, a, { font: t.font, fill: t.fillStyle, alpha: t.globalAlpha }]); };
    },
    set(t, k, v){ t[k] = v; return true; },
  });
  return { width: w, height: h, getContext: () => ctx, calls };
}
const px = font => parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
check(MAP.y >= SAFE.top && MAP.y + MAP.h <= 1000 && MAP.w === W, `the map (y ${MAP.y}–${MAP.y + MAP.h}) sits between the top bar and the buttons down the right`);
for (const [n, src] of [[3, 'photos'], [37, 'tap'], [194, 'timeline']]){
  const codes = n === 194 ? new Set(ALL) : pick(n), p = V.plan({ codes, src });
  const layer = recorder(MAP.w, MAP.h + 48), frame = recorder(W, H), s = V.scene(FEATS, p, layer), c = frame.getContext();
  check(s.anchors.length === n && s.anchors.every(([x, y]) => x >= 0 && x <= W && y >= MAP.y - 1 && y <= MAP.y + MAP.h + 1), `${n}: every ring starts on the map`);
  const texts = [];
  for (let i = 0; i < p.frames; i++){ const r = V.drawFrame(c, s, i / FPS); texts.push(r); }
  check(s.settled === n, `${n}: all ${n} countries end up on the map layer (${s.settled})`);
  const first = texts[0].drawn.map(d => d.str), last = texts[texts.length - 1].drawn;
  check(first.includes('I HAVE BEEN TO') && first.includes('0') && first.includes('of 194 countries') && first.includes('counter.getdriftlog.com') && !first.includes(V.NOTE), `${n}: the first frame`);
  const big = last.find(d => d.str === 'counter.getdriftlog.com' && d.alpha === 1);
  check(big && px(big.font) >= 54 && big.y <= SAFE.bottom - 0.25 * px(big.font) && big.str.length * px(big.font) * 0.55 <= SAFE.right - SAFE.left,
    `${n}: the address at the end is big (${big && px(big.font)} px) and inside the clear area (baseline ${big && big.y})`);
  check(last.some(d => d.str === V.NOTE && d.alpha === 1) && last.some(d => d.str === String(n)) && (src === 'tap' ? last.some(d => d.str === 'picked by hand') : last.some(d => d.str === CAP[src])),
    `${n}: the end card has ${n}, the 194 note and "${CAP[src]}"`);
  const everything = texts.flatMap(t => t.drawn);
  check(everything.every(d => d.y - px(d.font) * 0.8 >= SAFE.top && d.y + px(d.font) * 0.25 <= SAFE.bottom && d.str.length * px(d.font) * 0.55 <= (d.y > 1000 ? SAFE.right - SAFE.left : W)),
    `${n}: every text on every frame is inside the clear area`);
  check(src !== 'tap' || !everything.some(d => /photo/i.test(d.str)), `${n}: picked by hand never says "photos"`);
  const rings = frame.calls.filter(k => k[0] === 'arc').length;
  check(rings >= n, `${n}: a ring for each country (${rings} ring frames)`);
}
{ // Countries too small to see at phone size get a dot of their own, drawn onto the layer when they settle.
  const codes = new Set(['SG', 'CY', 'LB', 'RU', 'FR', 'BR']), p = V.plan({ codes, src: 'tap' }), layer = recorder(MAP.w, MAP.h + 48);
  const s = V.scene(FEATS, p, layer), tiny = p.order.filter((c, i) => s.tiny[i]).sort().join();
  check(tiny === 'CY,LB,SG', `a dot for the tiny ones only: ${tiny}`);
  layer.calls.length = 0;
  V.drawFrame(recorder(W, H).getContext(), s, p.duration);
  check(layer.calls.filter(k => k[0] === 'arc' && k[1][2] === 6.5).length === 3, 'the three dots are on the map layer at the end');
}
{ // A photo count paints the polygons the photos landed in: France from Paris only, not French Guiana.
  const fr = FEATS.findIndex(f => f.k && f.a === 'FR'), guiana = FEATS[fr].pb.findIndex(b => b[0] < -50 && b[2] < -50);
  const main = FEATS[fr].pb.reduce((best, b, i) => (b[2] - b[0]) * (b[3] - b[1]) > (FEATS[fr].pb[best][2] - FEATS[fr].pb[best][0]) * (FEATS[fr].pb[best][3] - FEATS[fr].pb[best][1]) ? i : best, 0);
  const p = V.plan({ codes: new Set(['FR']), src: 'photos', hits: new Map([[fr, new Set([guiana])]]) });
  const s = V.scene(FEATS, p, recorder(MAP.w, MAP.h + 48));
  check(s.anchors[0][0] < W * (130 / 360) && guiana >= 0 && main !== guiana, `France counted from a photo in the Americas: the ring starts there (x ${s.anchors[0][0] | 0})`);
  const q = V.plan({ codes: new Set(['FR']), src: 'tap' }), t = V.scene(FEATS, q, recorder(MAP.w, MAP.h + 48));
  check(t.anchors[0][0] > W * (175 / 360) && t.anchors[0][1] < MAP.y + MAP.h * (45 / 145), `France picked by hand: the ring starts in Europe (${t.anchors[0].map(v => v | 0)})`);
}

// 4. The MP4 writer, read back box by box.
function boxes(buf, start = 0, end = buf.length){
  const out = [];
  for (let o = start; o + 8 <= end;){ const size = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8); out.push({ type, start: o, size, body: o + 8 }); if (size < 8) break; o += size; }
  return out;
}
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts']);
function find(buf, path, from = boxes(buf)){
  const [head, ...rest] = path.split('/');
  const b = from.find(x => x.type === head);
  if (!b || !rest.length) return b;
  const skip = head === 'stsd' ? 8 : 0;
  return find(buf, rest.join('/'), boxes(buf, b.body + skip, b.start + b.size));
}
const table = (buf, b, width) => { const n = buf.readUInt32BE(b.body + 4), out = []; for (let i = 0; i < n; i++) out.push([...Array(width)].map((_, k) => buf.readUInt32BE(b.body + 8 + (i * width + k) * 4))); return out; };
const nal = (type, len) => { const u = new Uint8Array(len); u[0] = type; for (let i = 1; i < len; i++) u[i] = (i * 7 + len) & 255 || 1; return u; };
const avccOf = units => { const parts = []; for (const u of units){ const b = Buffer.alloc(4); b.writeUInt32BE(u.length); parts.push(b, Buffer.from(u)); } return new Uint8Array(Buffer.concat(parts)); };
const FAKE_AVCC = new Uint8Array([1, 0x64, 0, 0x28, 0xFF, 0xE1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 2, 0x68, 0xEE]);
async function write(chunks, opts){ return Buffer.from(await V.mp4(chunks, Object.assign({ width: 1080, height: 1920, fps: 30 }, opts)).arrayBuffer()); }
{
  const chunks = [...Array(90).keys()].map(i => ({ data: avccOf([nal(i % 30 ? 1 : 5, 50 + ((rand() * 400) | 0))]), key: i % 30 === 0, ts: Math.round(i * 1e6 / 30) }));
  const buf = await write(chunks, { avcC: FAKE_AVCC, colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'bt709', fullRange: false } });
  const top = boxes(buf);
  check(top.map(b => b.type).join() === 'ftyp,moov,mdat' && top[2].start + top[2].size === buf.length, `top level: ${top.map(b => b.type).join(', ')}, filling the file`);
  const stco = find(buf, 'moov/trak/mdia/minf/stbl/stco'), off = buf.readUInt32BE(stco.body + 8);
  check(off === top[2].body, `stco points at the first byte of mdat's payload (${off})`);
  const sizes = [...Array(90).keys()].map(i => buf.readUInt32BE(find(buf, 'moov/trak/mdia/minf/stbl/stsz').body + 12 + i * 4));
  check(sizes.every((s, i) => s === chunks[i].data.length), 'stsz: every sample size');
  let o = off;
  check(chunks.every((ch, i) => { const same = Buffer.compare(buf.subarray(o, o + sizes[i]), Buffer.from(ch.data)) === 0; o += sizes[i]; return same; }), 'mdat: every sample, byte for byte, in order');
  check(JSON.stringify(table(buf, find(buf, 'moov/trak/mdia/minf/stbl/stts'), 2)) === '[[90,1000]]', 'stts: 90 frames of 1/30 s');
  check(JSON.stringify(table(buf, find(buf, 'moov/trak/mdia/minf/stbl/stss'), 1)) === '[[1],[31],[61]]', 'stss: the key frames');
  check(!find(buf, 'moov/trak/mdia/minf/stbl/ctts') && !find(buf, 'moov/trak/edts'), 'frames in order: no ctts, no edit list');
  const mdhd = find(buf, 'moov/trak/mdia/mdhd'), mvhd = find(buf, 'moov/mvhd'), tkhd = find(buf, 'moov/trak/tkhd');
  check(buf.readUInt32BE(mdhd.body + 12) === 30000 && buf.readUInt32BE(mdhd.body + 16) === 90000 && buf.readUInt32BE(mvhd.body + 12) === 1000 && buf.readUInt32BE(mvhd.body + 16) === 3000,
    'durations: 90000 / 30000 in the track, 3000 ms in the movie');
  check(buf.readUInt32BE(tkhd.body + 76) === 1080 * 65536 && buf.readUInt32BE(tkhd.body + 80) === 1920 * 65536, 'tkhd: 1080 × 1920');
  const avc1 = find(buf, 'moov/trak/mdia/minf/stbl/stsd/avc1');
  check(avc1 && buf.readUInt16BE(avc1.body + 24) === 1080 && buf.readUInt16BE(avc1.body + 26) === 1920, 'avc1: 1080 × 1920');
  const inner = boxes(buf, avc1.body + 78, avc1.start + avc1.size), avcC = inner.find(b => b.type === 'avcC'), colr = inner.find(b => b.type === 'colr');
  check(avcC && Buffer.compare(buf.subarray(avcC.body, avcC.start + avcC.size), Buffer.from(FAKE_AVCC)) === 0, 'avcC: the encoder\'s own, unchanged');
  check(colr && buf.toString('latin1', colr.body, colr.body + 4) === 'nclx' && buf.readUInt16BE(colr.body + 4) === 1 && buf.readUInt16BE(colr.body + 6) === 13 && buf.readUInt16BE(colr.body + 8) === 1,
    'colr: the colour space the encoder reported (BT.709, sRGB transfer)');
  const none = await write(chunks, { avcC: FAKE_AVCC, colorSpace: { primaries: 'made-up' } });
  check(!boxes(none, find(none, 'moov/trak/mdia/minf/stbl/stsd/avc1').body + 78).some(b => b.type === 'colr'), 'an unknown colour space: no colr');
}
{ // Frames reordered by the encoder (B-frames): ctts and an edit list bring back the order they are shown in.
  const pts = [0, 3, 1, 2, 6, 4, 5, 9, 7, 8, 10, 11];
  const chunks = pts.map((v, i) => ({ data: avccOf([nal(i ? 1 : 5, 30 + i)]), key: i === 0, ts: Math.round(v * 1e6 / 30) }));
  const buf = await write(chunks, { avcC: FAKE_AVCC });
  const ctts = find(buf, 'moov/trak/mdia/minf/stbl/ctts'), elst = find(buf, 'moov/trak/edts/elst');
  check(ctts && elst, 'reordered frames: ctts and an edit list are written');
  if (ctts && elst){
    const offsets = table(buf, ctts, 2).flatMap(([k, d]) => Array(k).fill(d)), shift = buf.readUInt32BE(elst.body + 12);
    check(offsets.length === 12 && offsets.every((d, i) => i * 1000 + d - shift === pts[i] * 1000), `ctts + elst: each frame shows at its own time (edit list starts at ${shift})`);
  }
}
{ // Annex B (start codes) without an avcC: rebuilt from the stream's SPS and PPS, which leave the samples.
  const sps = nal(0x67, 12), pps = nal(0x68, 5), aud = nal(0x09, 2);
  sps[1] = 0x64; sps[2] = 0; sps[3] = 0x28;
  const sc = [0, 0, 0, 1];
  const chunks = [0, 1, 2].map(i => ({ data: new Uint8Array([...sc, ...aud, ...(i ? [] : [...sc, ...sps, ...sc, ...pps]), ...sc, ...nal(i ? 0x41 : 0x65, 40)]), key: !i, ts: Math.round(i * 1e6 / 30) }));
  const { samples, avcC } = V.fromAnnexB(chunks);
  check(samples.every((s, i) => V.isAvcc(s.data) && s.data.length === 44 && s.data[4] === (i ? 0x41 : 0x65)), 'Annex B: one length-prefixed slice per sample, no SPS, PPS or delimiter');
  check(avcC[0] === 1 && avcC[1] === 0x64 && avcC[3] === 0x28 && avcC[5] === 0xE1 && avcC.length === 6 + 2 + 12 + 1 + 2 + 5 + 4, 'Annex B: avcC from the SPS and PPS (High profile: 4:2:0, 8 bits)');
  check(!V.isAvcc(chunks[0].data) && V.isAvcc(avccOf([nal(5, 9), nal(1, 3)])) && !V.isAvcc(new Uint8Array(0)), 'isAvcc tells the two apart');
}

// 5. Real H.264 from ffmpeg (when installed): written by mp4(), decoded without an error, same pictures in the same order.
const hasFfmpeg = ['ffmpeg', 'ffprobe'].every(b => spawnSync(b, ['-version']).status === 0);
if (!hasFfmpeg) console.log('SKIP ffmpeg checks: ffmpeg and ffprobe not found');
else {
  const dir = mkdtempSync(join(tmpdir(), 'driftlog-video-'));
  const ff = args => spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  const hashes = f => ff(['-i', f, '-f', 'framemd5', '-']).stdout.split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').pop().trim());
  const src = ['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-frames:v', '75', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30'];
  try {
    for (const bf of [0, 2]){
      const a = join(dir, `src${bf}.mp4`), b = join(dir, `out${bf}.mp4`);
      ff([...src, '-bf', String(bf), a]);
      const file = readFileSync(a);
      const packets = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags,pos,size', '-of', 'json', a], { encoding: 'utf8' }).stdout).packets;
      const at = file.indexOf('avcC'), avcC = new Uint8Array(file.subarray(at + 4, at - 4 + file.readUInt32BE(at - 4)));
      const chunks = packets.map(k => ({ data: new Uint8Array(file.subarray(+k.pos, +k.pos + +k.size)), key: k.flags.includes('K'), ts: Math.round(+k.pts_time * 1e6) }));
      writeFileSync(b, await write(chunks, { avcC, width: 360, height: 640 }));
      const err = ff(['-i', b, '-f', 'null', '-']).stderr;
      const ha = hashes(a), hb = hashes(b);
      check(err === '' && hb.length === 75 && ha.join() === hb.join(), `ffmpeg (${bf ? 'with' : 'no'} B-frames): decodes cleanly, 75 frames, the same pictures in order (${hb.length}${err ? ', ' + err.trim().slice(0, 80) : ''})`);
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames:format=duration', '-of', 'json', b], { encoding: 'utf8' });
      const st = JSON.parse(probe.stdout);
      check(st.streams[0].codec_name === 'h264' && +st.streams[0].nb_frames === 75 && Math.abs(+st.format.duration - 2.5) < 0.001, `ffprobe (${bf} B-frames): h264, 75 frames, ${st.format.duration} s`);
    }
    // Annex B with access unit delimiters, as some encoders hand it over: no avcC given.
    const h = join(dir, 'src.h264'), o = join(dir, 'annexb.mp4');
    ff([...src, '-bf', '0', '-bsf:v', 'h264_metadata=aud=insert', '-f', 'h264', h]);
    const raw = new Uint8Array(readFileSync(h)), starts = [];
    for (let i = 0; i + 4 < raw.length; i++) if (raw[i] === 0 && raw[i + 1] === 0 && raw[i + 2] === 1 && (raw[i + 3] & 31) === 9) starts.push(raw[i - 1] === 0 ? i - 1 : i);
    const aus = starts.map((s, k) => raw.subarray(s, starts[k + 1] || raw.length));
    const idr = d => { for (let j = 0; j + 3 < d.length; j++) if (d[j] === 0 && d[j + 1] === 0 && d[j + 2] === 1 && (d[j + 3] & 31) === 5) return true; return false; };
    const chunks = aus.map((d, i) => ({ data: d, key: idr(d), ts: Math.round(i * 1e6 / 30) }));
    writeFileSync(o, await write(chunks, { width: 360, height: 640 }));
    const err = ff(['-i', o, '-f', 'null', '-']).stderr;
    check(aus.length === 75 && err === '' && hashes(o).join() === hashes(h).join(), `ffmpeg (Annex B, no avcC): ${aus.length} access units, decodes cleanly, same pictures${err ? ': ' + err.trim().slice(0, 80) : ''}`);
    console.log('ffmpeg: libx264 without and with B-frames, and Annex B: written by mp4(), decoded, same pictures in order');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// 6. The route: WebCodecs H.264 where the browser has it, else MediaRecorder (MP4 before WebM), else the image.
async function routesWith(globals){
  const ctx = vm.createContext(Object.assign({ console, Map, Set, Promise, Math, JSON, Number, String, Array, Object, Error, RegExp, Uint8Array, ArrayBuffer, Blob, setTimeout }, globals));
  ctx.window = ctx;
  vm.runInContext(kitSource, ctx); vm.runInContext(videoSource, ctx);
  return (await ctx.DriftlogVideo.routes({ captureStream: () => ({}) })).map(r => r.kind + (r.cfg ? ':' + r.cfg.codec : '') + (r.type !== undefined ? ':' + r.type : '')).join(' ');
}
const encoderSupporting = codecs => Object.assign(function VideoEncoder(){}, { isConfigSupported: async cfg => ({ supported: codecs.includes(cfg.codec) && cfg.width === 1080 && cfg.height === 1920 }) });
const recorderSupporting = test => Object.assign(function MediaRecorder(){}, { isTypeSupported: test });
check(await routesWith({ VideoEncoder: encoderSupporting(['avc1.640028', 'avc1.420028']), VideoFrame: function (){}, MediaRecorder: recorderSupporting(() => true) })
  === 'webcodecs:avc1.640028 recorder:video/mp4;codecs=avc1.640028 still', 'everything there: WebCodecs (High 4.0), then MediaRecorder MP4, then the image');
check(await routesWith({ VideoEncoder: encoderSupporting(['avc1.420028']), VideoFrame: function (){} }) === 'webcodecs:avc1.420028 still', 'only Baseline 4.0 encodes: that one; no MediaRecorder');
check(await routesWith({ VideoEncoder: encoderSupporting([]), VideoFrame: function (){}, MediaRecorder: recorderSupporting(t => t.startsWith('video/webm')) }) === 'recorder:video/webm;codecs=vp9 still',
  'no H.264 encoder, WebM recording only (Firefox): MediaRecorder WebM');
check(await routesWith({ MediaRecorder: recorderSupporting(t => t === 'video/mp4') }) === 'recorder:video/mp4 still', 'no WebCodecs (older Safari): MediaRecorder MP4');
check(await routesWith({ MediaRecorder: function MediaRecorder(){} }) === 'recorder: still', 'MediaRecorder without isTypeSupported: the browser\'s own format');
check(await routesWith({}) === 'still', 'neither: the image only');

// 6b. An encoder that stops without an error, taking frames and handing nothing back or never finishing flush(),
// counts as failed after LIMITS and the next route makes the clip (here the image: there is no MediaRecorder). One
// that is slow but keeps handing frames back is waited for.
async function makeWith(mode){
  const avcC = new Uint8Array([1, 100, 0, 40, 255, 225, 0, 4, 103, 100, 0, 40, 1, 0, 4, 104, 238, 60, 128]);
  class VideoEncoder {
    constructor(o){ this.o = o; this.state = 'unconfigured'; this.encodeQueueSize = 0; this.pending = 0; }
    static async isConfigSupported(cfg){ return { supported: cfg.codec === 'avc1.640028' }; }
    configure(){ this.state = 'configured'; }
    encode(frame, opt){
      this.encodeQueueSize++;
      if (mode === 'silent') return;
      const out = () => { this.encodeQueueSize--; this.o.output({ byteLength: 5, type: opt.keyFrame ? 'key' : 'delta', timestamp: frame.ts, copyTo: d => d.set([0, 0, 0, 1, 101]) }, { decoderConfig: { description: avcC } }); };
      if (mode === 'no-flush') out(); else { this.pending++; setTimeout(() => { out(); this.pending--; }, 8); }
    }
    flush(){ return mode === 'slow' ? new Promise(res => { const t = setInterval(() => { if (!this.pending){ clearInterval(t); res(); } }, 5); }) : new Promise(() => {}); }
    close(){ this.state = 'closed'; }
  }
  const ctx = vm.createContext({ console, Map, Set, Promise, Math, JSON, Number, String, Array, Object, Error, RegExp, Uint8Array, ArrayBuffer, Blob, Date,
    setTimeout, clearTimeout, setInterval, clearInterval, VideoEncoder, VideoFrame: function (c, o){ this.ts = o.timestamp; this.close = () => {}; },
    document: { createElement: () => recorder(MAP.w, MAP.h + 48) } });
  ctx.window = ctx;
  vm.runInContext(kitSource, ctx); vm.runInContext(videoSource, ctx);
  Object.assign(ctx.DriftlogVideo.LIMITS || {}, { stall: 150, flush: 300 });
  const canvas = Object.assign(recorder(W, H), { toBlob: cb => cb(new Blob(['png'], { type: 'image/png' })) });
  const t = Date.now();
  try {
    let stop = true;   // a make() that never returns is the bug itself: give up on it after 10 s and say so
    const r = await Promise.race([ctx.DriftlogVideo.make(canvas, FEATS, { codes: new Set(['JP', 'FR', 'PE']), src: 'tap' }, () => stop),
      sleep(10000).then(() => { stop = false; return { route: 'still making it after 10 s' }; })]);
    return { route: r.route, ms: Date.now() - t };
  } catch (e){ return { route: 'threw ' + e.message, ms: Date.now() - t }; }
}
{
  const silent = await makeWith('silent'), noFlush = await makeWith('no-flush'), slow = await makeWith('slow');
  check(silent.route === 'still' && silent.ms < 3000, `an encoder that hands nothing back: given up after the stall limit, the image instead (${silent.route}, ${silent.ms} ms)`);
  check(noFlush.route === 'still' && noFlush.ms < 3000, `an encoder whose flush() never ends: given up after the flush limit, the image instead (${noFlush.route}, ${noFlush.ms} ms)`);
  check(slow.route === 'webcodecs', `a slow encoder that keeps handing frames back is waited for (${slow.route}, ${slow.ms} ms)`);
}

// 7. The pages. "Save video" gets a real list only: the counter's result (photos with their years and polygons, a
// pick, an edit), your own list on the receiving end (never theirs), and the passport page's list. Not the example.
const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [new File([readFileSync(p)], n)]; });
let page = loadPage();
await page.T.handle(walk(join(ROOT, 'tests', 'fixtures')));
let l = page.T.resultVideo.list;
check(l && sameSet(l.codes, page.T.lastRun.codes) && l.src === 'both' && l.years && l.years.size === 15 && l.hits && l.hits.size >= 15 && page.document.querySelector('#vidRow').hidden === false,
  `photo count: the video has the 15, their first years, s=both and the polygons hit (${l && l.hits && l.hits.size})`);
check(l && l.hits && [...l.hits.keys()].every(fi => page.T.FEATS[fi].k), 'photo count: only counted countries are painted (Hong Kong and Vatican City are not)');
const fewer = new Set([...page.T.lastRun.codes].filter(c => c !== 'JP')), e = page.T.edited(page.T.lastRun, fewer);
await page.T.renderPicked(fewer, e.src, e);
l = page.T.resultVideo.list;
check(l && l.codes.size === 14 && l.src === 'edited' && l.base === 'both' && l.years.size === 14 && !l.hits, 'edited: 14, s=edited from both, years kept, painted by country');
await page.T.renderPicked(new Set(['JP', 'PE', 'IS']), 'tap');
l = page.T.resultVideo.list;
check(l && l.codes.size === 3 && l.src === 'tap' && !l.years && V.plan(l).caption === 'picked by hand', 'picked by hand: s=tap, no years, "picked by hand"');
await page.T.renderPicked(new Set(), 'tap');
check(page.T.resultVideo.list === null && page.document.querySelector('#vidRow').hidden === true, 'no countries: no video');
await page.T.showExample();
check(page.T.resultVideo.list === null && page.document.querySelector('#vidRow').hidden === true, 'the example: no video');
const theirs = pick(37), mine = pick(30);
page = loadPage({ hash: '#' + Kit.linkHash(theirs) });
await sleep(50);
page.T.MINE = { codes: mine, src: 'tap' };
await page.T.showCompare();
check(page.T.cmpVideo.list && sameSet(page.T.cmpVideo.list.codes, mine) && page.T.cmpVideo.list.src === 'tap', 'receiver: the video is your own 30, not their 37');
await page.T.handle(walk(join(ROOT, 'tests', 'fixtures')));
await sleep(20);
l = page.T.cmpVideo.list;
check(l && l.codes.size === 15 && l.src === 'both' && l.years.size === 15 && l.hits && l.hits.size >= 15, 'receiver counting photos: your 15 with their years and polygons');
// The passport page (its own stubbed DOM in passport.mjs; here only what it hands the video).
{
  const html = readFileSync(join(ROOT, 'passport', 'index.html'), 'utf8');
  check(html.indexOf('<script src="/video.js"></script>') > html.indexOf('<script src="/kit.js"></script>') && /<div id="vid"><\/div>/.test(html), 'passport page: loads /video.js after /kit.js and has the panel');
  check(/video\.set\(n \? \{ codes: st\.codes, years: st\.years, src: st\.src, base: st\.base \} : null\)/.test(html), 'passport page: the video gets the page\'s own list, years and source');
}
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check(html.indexOf('<script src="/video.js"></script>') > html.indexOf('<script src="/kit.js"></script>'), 'counter: loads /video.js after /kit.js, before its own script');
  check(!/https?:\/\/(?!driftlog-counter\.pages\.dev)[^"'\s)]+/.test(videoSource.replace(/\/\/.*$/gm, '')), 'video.js names no outside address (no library, no CDN)');
}

if (failures.length){ console.error('FAIL\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('PASS');
process.exit(0);
