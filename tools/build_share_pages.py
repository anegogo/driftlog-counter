#!/usr/bin/env python3
"""Builds the result-link pages of the English counter: <site>/c/<N>/index.html and <site>/c/og/<N>.png for
N = 0..194 (195 of each). Design notes: DESIGN-share.md.

A result link is https://driftlog-counter.pages.dev/c/<N>/#v=1.<mask>. Link previews (iMessage, X, Slack...)
fetch the page without the # and do not run scripts, so each N needs its own static page with its own OG tags.
The page itself only forwards to the counter, carrying the # along; the counter shows the shared list.
The pages are noindex with a canonical to the top page, and are left out of sitemap.xml and IndexNow:
195 near-identical pages would only compete with the top page, which Google has not indexed yet.
robots.txt must keep allowing /c/, or X and others would not fetch the preview.

The OG image has no countries on it (the path carries only the number): a big number, a plain world
silhouette and the address. Fonts are the site's own (fonts/, Fraunces and Inter); the map is countries50.json.

  python3 build_share_pages.py                       # into the site around tools/ (the source repo), else ../counter-staging
  python3 build_share_pages.py <site>                # into <site>/c/
  python3 build_share_pages.py --only 37             # one page and image, for a look
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_URL = 'https://driftlog-counter.pages.dev'
TOTAL = 194
W, H = 1200, 630
CREAM, LAND = (252, 247, 240), (236, 223, 208)
INK, MUTED, MUTED2, ACCENT = (50, 32, 20), (122, 101, 85), (143, 119, 101), (214, 105, 46)
FRAUNCES = 'fonts/fraunces-6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2'   # latin subset
INTER = 'fonts/inter-UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2'                           # latin subset


def font(site, path, size, **axes):
    f = ImageFont.truetype(os.path.join(site, path), size)
    names = {a['name'].decode() if isinstance(a['name'], bytes) else a['name']: a for a in f.get_variation_axes()}
    f.set_variation_by_axes([axes.get({'Weight': 'wght', 'Optical Size': 'opsz'}[n], names[n]['default']) for n in names])
    return f


def silhouette(site, box, scale=3):
    """Every country in one land colour, no borders, 85°N to 60°S like the site's map. Drawn large, then scaled
    down, because PIL polygons have no antialiasing."""
    x0, y0, bw, bh = box
    big = Image.new('L', (bw * scale, bh * scale), 0)
    d = ImageDraw.Draw(big)
    for f in json.load(open(os.path.join(site, 'countries50.json'))):
        if f['b'][3] < -60:
            continue
        for poly in ([f['c']] if f['t'] == 'Polygon' else f['c']):
            for k, ring in enumerate(poly):
                x = y = 0
                pts = []
                for i in range(0, len(ring), 2):
                    x += ring[i]; y += ring[i + 1]
                    lon, lat = x / 10000, max(y / 10000, -60)
                    pts.append(((lon + 180) / 360 * bw * scale, (85 - lat) / 145 * bh * scale))
                if len(pts) > 2:
                    d.polygon(pts, fill=0 if k else 255)    # rings after the first are holes (lakes, enclaves)
    mask = big.resize((bw, bh), Image.LANCZOS)
    return mask


def spaced_text(d, xy, text, fnt, fill, tracking):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill)
        x += d.textlength(ch, font=fnt) + tracking


def base_image(site):
    img = Image.new('RGB', (W, H), CREAM)
    box = (450, 132, 720, 372)          # 720 wide keeps the site's map proportions (1200 : 620)
    mask = silhouette(site, box)
    img.paste(Image.new('RGB', mask.size, LAND), box[:2], mask)
    return img


def og_image(site, base, n, fonts):
    img = base.copy()
    d = ImageDraw.Draw(img)
    # Placed by the drawn glyphs (textbbox), not by line boxes, so the gaps stay even for every number.
    top = lambda y, text, f: y - d.textbbox((0, 0), text, font=f)[1]
    spaced_text(d, (84, top(128, 'I', fonts['kicker'])), "I'VE BEEN TO", fonts['kicker'], ACCENT, 6)
    num = str(n)
    d.text((80, top(188, num, fonts['num'])), num, font=fonts['num'], fill=INK)
    d.text((86, top(384, 'of 194', fonts['of'])), f'of {TOTAL} countries', font=fonts['of'], fill=MUTED)
    tag = 'See which ones, and compare with yours.' if n else 'Which have you been to?'    # 0: nothing to see yet
    d.text((86, top(468, 'See', fonts['tag'])), tag, font=fonts['tag'], fill=MUTED2)
    d.text((86, top(522, 'd', fonts['url'])), 'driftlog-counter.pages.dev', font=fonts['url'], fill=ACCENT)
    # A palette PNG: flat colours and antialiased text need about 48 colours, and it keeps each file small.
    return img.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def page(n):
    title = f"I've been to {n} of {TOTAL} countries" if n else f'0 of {TOTAL} countries, so far'
    desc = (('See which ones on the map, then compare with yours' if n else 'Compare with yours')
            + ': pick countries with a tap, or count them from your photos. Free, runs in your browser, nothing is uploaded.')
    url, img = f'{SITE_URL}/c/{n}/', f'{SITE_URL}/c/og/{n}.png'
    e = lambda s: s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')   # ' stays as is
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{e(title)} · Driftlog Counter</title>
<meta name="robots" content="noindex" />
<link rel="canonical" href="{SITE_URL}/" />
<meta name="description" content="{e(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Driftlog" />
<meta property="og:url" content="{url}" />
<meta property="og:title" content="{e(title)}" />
<meta property="og:description" content="{e(desc)}" />
<meta property="og:image" content="{img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="{e(title)}. driftlog-counter.pages.dev" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{e(title)}" />
<meta name="twitter:description" content="{e(desc)}" />
<meta name="twitter:image" content="{img}" />
<script>
// The list is after the #, which never reaches the server. Carry it to the counter, which draws it.
location.replace('/' + location.hash);
</script>
<style>body{{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#FCF7F0;color:#322014;text-align:center;padding:80px 20px}}a{{color:#B9561F}}</style>
</head>
<body>
<p>Opening the map…</p>
<p><a href="/">How many countries have you been to? Count yours</a></p>
</body>
</html>
'''


def main():
    argv, only = sys.argv[1:], None
    if '--only' in argv:
        k = argv.index('--only')
        only, argv = int(argv[k + 1]), argv[:k] + argv[k + 2:]
    # Default: the site this tools/ folder sits in (the source repo), else ../counter-staging (the working copy).
    inside = os.path.join(HERE, '..')
    site = os.path.abspath(argv[0] if argv else inside if os.path.exists(os.path.join(inside, 'kit.js')) else os.path.join(HERE, '..', 'counter-staging'))
    fonts = {
        'kicker': font(site, INTER, 26, wght=600),
        'num': font(site, FRAUNCES, 230, wght=600, opsz=36),
        'of': font(site, FRAUNCES, 50, wght=600, opsz=36),
        'tag': font(site, INTER, 27, wght=400),
        'url': font(site, INTER, 26, wght=500),
    }
    base = base_image(site)
    os.makedirs(os.path.join(site, 'c', 'og'), exist_ok=True)
    sizes = []
    for n in ([only] if only is not None else range(TOTAL + 1)):
        os.makedirs(os.path.join(site, 'c', str(n)), exist_ok=True)
        with open(os.path.join(site, 'c', str(n), 'index.html'), 'w', encoding='utf-8') as fh:
            fh.write(page(n))
        png = os.path.join(site, 'c', 'og', f'{n}.png')
        og_image(site, base, n, fonts).save(png, optimize=True)
        sizes.append(os.path.getsize(png))
    print(f'{len(sizes)} pages and images in {site}/c/ · image size {min(sizes)}–{max(sizes)} bytes, '
          f'{sum(sizes) / 1024 / 1024:.2f} MB in all')


if __name__ == '__main__':
    main()
