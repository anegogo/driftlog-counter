#!/usr/bin/env python3
"""Builds the Open Graph image of the passport page: <site>/passport/og.png (1200 x 630). Design notes: DESIGN-share.md 9.

Six stamps, one per region, cut from the site's own stamp sheets (stamps/sheet-<k>.webp, kit.js table order) at the
tilt the app gives them, then three empty slots: what the page makes, with no count on it, so it reads as an
illustration and not as anyone's travels. Fonts are the site's own (fonts/, Fraunces and Inter).

  python3 build_passport_og.py            # into the site around tools/ (the source repo), else ../counter-staging
  python3 build_passport_og.py <site>
"""
import os, sys
from PIL import Image, ImageDraw
from build_share_pages import font, spaced_text, FRAUNCES, INTER, INK, MUTED, ACCENT

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 630
PAPER, SLOT, FRAME = (250, 246, 239), (217, 202, 183), (230, 216, 198)
SHOW = ['IT', 'JP', 'MX', 'PE', 'MA', 'NZ']        # Europe, Asia, North America, South America, Africa, Oceania
PX, COLS, PER = 240, 7, 49                          # the sheets: 240 px stamps, 7 x 7, in kit.js table order


def table_order(site):
    kit = open(os.path.join(site, 'kit.js'), encoding='utf-8').read()
    t = kit[kit.index('const TABLE = `') + len('const TABLE = `'):]
    return [line[:2] for line in t[:t.index('`;')].strip().split('\n')]


def tilt(code):
    """The app's PassportView.rotation(for:), as in kit.js stampTilt: degrees, positive = clockwise."""
    return sum(map(ord, code)) % 17 - 8


def stamp(site, order, code, size):
    i = order.index(code)
    k, j = divmod(i, PER)
    sheet = Image.open(os.path.join(site, 'stamps', f'sheet-{k}.webp')).convert('RGBA')
    x, y = (j % COLS) * PX, (j // COLS) * PX
    im = sheet.crop((x, y, x + PX, y + PX))
    im = im.rotate(-tilt(code), resample=Image.BICUBIC, expand=True)   # PIL turns counter-clockwise
    s = round(size * im.width / PX)
    return im.resize((s, s), Image.LANCZOS)


def dashed_square(d, box, color, width, dash, gap, r):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=r, outline=None)
    for (ax, ay, bx, by) in ((x0 + r, y0, x1 - r, y0), (x1, y0 + r, x1, y1 - r), (x1 - r, y1, x0 + r, y1), (x0, y1 - r, x0, y0 + r)):
        length = max(abs(bx - ax), abs(by - ay))
        t = 0
        while t < length:
            e = min(t + dash, length)
            fx, fy = ax + (bx - ax) * t / length, ay + (by - ay) * t / length
            tx, ty = ax + (bx - ax) * e / length, ay + (by - ay) * e / length
            d.line((fx, fy, tx, ty), fill=color, width=width)
            t += dash + gap
    for cx, cy, a0 in ((x0 + r, y0 + r, 180), (x1 - r, y0 + r, 270), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90)):
        d.arc((cx - r, cy - r, cx + r, cy + r), a0, a0 + 90, fill=color, width=width)


def main():
    inside = os.path.join(HERE, '..')
    site = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else inside if os.path.exists(os.path.join(inside, 'kit.js')) else os.path.join(HERE, '..', 'counter-staging'))
    order = table_order(site)
    img = Image.new('RGBA', (W, H), PAPER + (255,))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((18, 18, W - 18, H - 18), radius=22, outline=FRAME, width=2)
    # The stamps: 3 x 3 cells on the right, the last three empty.
    cell, gx, gy = 172, 648, 57
    size = round(cell * 0.88)
    for k in range(9):
        cx, cy = gx + (k % 3 + 0.5) * cell, gy + (k // 3 + 0.5) * cell
        if k < len(SHOW):
            s = stamp(site, order, SHOW[k], size)
            img.alpha_composite(s, (round(cx - s.width / 2), round(cy - s.height / 2)))
        else:
            half = size * 160 / 168 / 2
            dashed_square(d, (cx - half, cy - half, cx + half, cy + half), SLOT, 2, 9, 7, 10)
    top = lambda y, text, f: y - d.textbbox((0, 0), text, font=f)[1]
    kicker, title, tag, url = font(site, INTER, 22, wght=600), font(site, FRAUNCES, 66, wght=600, opsz=36), font(site, INTER, 27, wght=400), font(site, INTER, 25, wght=500)
    spaced_text(d, (72, top(128, 'D', kicker)), 'DRIFTLOG', kicker, ACCENT, 6)
    d.text((68, top(178, 'M', title)), 'Make your', font=title, fill=INK)
    d.text((68, top(258, 'p', title)), 'passport page', font=title, fill=INK)
    d.text((72, top(372, 'A', tag)), "A stamp for every country", font=tag, fill=MUTED)
    d.text((72, top(410, 'y', tag)), "you've been to, out of 194.", font=tag, fill=MUTED)
    d.text((72, top(488, 'd', url)), 'counter.getdriftlog.com/passport', font=url, fill=ACCENT)
    out = os.path.join(site, 'passport', 'og.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.convert('RGB').quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(out, optimize=True)
    print(f'{out}: {os.path.getsize(out):,} bytes')


if __name__ == '__main__':
    main()
