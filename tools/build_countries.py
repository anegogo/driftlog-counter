"""Build ../countries50.json, the border file the page reads, from world-atlas
(Natural Earth 1:50m and 1:10m as TopoJSON). Run tools/fetch-data.sh first.

Output: [{n, a, k, t, c, b}], smallest features first.
n = English display name, a = ISO 3166-1 alpha-2 (or null), k = 1 when it counts toward
the headline (the 193 UN member states + Taiwan), t = 'Polygon' | 'MultiPolygon',
c = rings as flat integer arrays in 1/10000 degree, first pair absolute and the rest deltas,
b = bbox [minLon, minLat, maxLon, maxLat].

    EPS=0.005 python3 tools/build_countries.py   # the default; reproduces the committed file
"""
import json, re, sys, subprocess
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
topo = json.loads((DATA / "countries-50m.json").read_text())
codes = json.loads((DATA / "codes.json").read_text())
num2a2 = {row[2]: row[0] for row in codes}

# The 193 UN member states + Taiwan (the 194 passport stamps in the Driftlog app).
CODES194 = set("""AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VC VE VN VU WS YE ZA ZM ZW""".split())
assert len(CODES194) == 194, len(CODES194)

# Natural Earth features with no ISO numeric id in world-atlas: map by NE name.
NAME2A2 = {"Kosovo": "XK", "N. Cyprus": "CY", "Somaliland": "SO", "Siachen Glacier": None,
           "Indian Ocean Ter.": "AU", "Ashmore and Cartier Is.": "AU"}

# English display names, from the browser's own Intl region names, with the same
# overrides the in-app stamp poster uses, plus a few for readability.
all_a2 = sorted(set(num2a2.values()) | {"XK"})
js = "const d=new Intl.DisplayNames(['en'],{type:'region'});const o={};for(const c of %s){o[c]=d.of(c)};console.log(JSON.stringify(o))" % json.dumps(all_a2)
en = json.loads(subprocess.check_output(["node", "-e", js]))
en.update({"CN": "China", "MM": "Myanmar", "CD": "DR Congo", "CG": "Congo",
           "VC": "St Vincent & the Grenadines", "KN": "St Kitts & Nevis",
           "HK": "Hong Kong", "MO": "Macao", "PS": "Palestine", "VA": "Vatican City",
           "CI": "Côte d'Ivoire", "BA": "Bosnia and Herzegovina", "FM": "Micronesia",
           "UM": "US Outlying Islands", "VI": "US Virgin Islands", "HM": "Heard & McDonald Islands",
           "GS": "South Georgia", "BQ": "Caribbean Netherlands", "PN": "Pitcairn Islands",
           "IO": "British Indian Ocean Territory", "TF": "French Southern Territories",
           "ST": "São Tomé & Príncipe", "TR": "Türkiye", "CZ": "Czechia"})

def decode_arcs(t):
    sx, sy = t["transform"]["scale"]
    tx, ty = t["transform"]["translate"]
    out = []
    for arc in t["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((round(x * sx + tx, 4), round(y * sy + ty, 4)))
        out.append(pts)
    return out

topo10 = json.loads((DATA / "countries-10m.json").read_text())
ARCS = {50: decode_arcs(topo), 10: decode_arcs(topo10)}
arcs = ARCS[50]
# Small places where 1:50m is too coarse or misplaced: take their 1:10m outline instead.
USE10 = {"Hong Kong", "Macao", "Maldives", "Singapore", "Malta", "Bahrain", "Luxembourg", "Andorra",
         "Liechtenstein", "San Marino", "Mauritius", "Seychelles", "Barbados", "Grenada", "St. Lucia",
         "St. Vin. and Gren.", "St. Kitts and Nevis", "Antigua and Barb.", "Dominica", "Comoros",
         "Cabo Verde", "São Tomé and Principe", "Palau", "Marshall Is.", "Micronesia", "Kiribati", "Nauru", "Tonga", "Samoa"}
# Present only at 1:10m. None = leave out.
ONLY10 = {"Tuvalu": "TV", "Gibraltar": "GI", "Akrotiri": "CY", "Dhekelia": "CY", "Cyprus U.N. Buffer Zone": "CY",
          "Baikonur": "KZ", "USNB Guantanamo Bay": "CU"}
g10 = {g["properties"]["name"]: g for g in topo10["objects"]["countries"]["geometries"]}
# Natural Earth draws the Vatican as a sliver about 1 km west of the real one; use a hand-traced outline.
VATICAN = [[12.4457,41.9031],[12.4474,41.9003],[12.4531,41.9001],[12.4582,41.9017],[12.4585,41.9035],
           [12.4561,41.9048],[12.4539,41.9073],[12.4497,41.9071],[12.4462,41.9056],[12.4457,41.9031]]

sys.setrecursionlimit(100000)
# Douglas-Peucker tolerance in degrees (~500 m).
EPS=float(__import__("os").environ.get("EPS","0.005"))

def _rdp(pts, eps):
    if len(pts) < 3:
        return pts
    import math
    (x1,y1),(x2,y2)=pts[0],pts[-1]
    dx,dy=x2-x1,y2-y1
    L=math.hypot(dx,dy)
    best,bi=-1,0
    for i in range(1,len(pts)-1):
        px,py=pts[i]
        d=abs(dy*px-dx*py+x2*y1-y2*x1)/L if L else math.hypot(px-x1,py-y1)
        if d>best: best,bi=d,i
    if best>eps:
        return _rdp(pts[:bi+1],eps)[:-1]+_rdp(pts[bi:],eps)
    return [pts[0],pts[-1]]

def simplify(r, eps=EPS):
    if len(r) <= 8:
        return r
    s=_rdp(r, eps)
    if len(s) < 4:
        return r[:: max(1, len(r)//6)] + [r[0]]
    if s[0]!=s[-1]: s.append(s[0])
    return s

def ring(idx_list, arcs=None):
    arcs = arcs or ARCS[50]
    out = []
    for i in idx_list:
        pts = arcs[i] if i >= 0 else arcs[~i][::-1]
        if out:
            pts = pts[1:]
        out.extend(pts)
    # drop consecutive duplicates introduced by rounding
    clean = [out[0]]
    for p in out[1:]:
        if p != clean[-1]:
            clean.append(p)
    clean = simplify(clean)
    return [[round(p[0],4), round(p[1],4)] for p in clean]

SCALE = int(__import__("os").environ.get("SCALE","10000"))

def split_antimeridian(pts):
    """Split a ring that jumps from +180 to -180 into rings that each stay on one side."""
    segs = [[pts[0]]]
    for a, b in zip(pts, pts[1:]):
        if abs(a[0] - b[0]) > 180:
            edge = 180.0 if a[0] > 0 else -180.0
            bx = b[0] + (360 if a[0] > 0 else -360)
            t = (edge - a[0]) / (bx - a[0]) if bx != a[0] else 0
            yc = round(a[1] + t * (b[1] - a[1]), 4)
            segs[-1].append([edge, yc])
            segs.append([[-edge, yc], b])
        else:
            segs[-1].append(b)
    if len(segs) == 1:
        return [pts]
    segs[0] = segs[-1] + segs[0][1:]
    segs.pop()
    out = []
    for s in segs:
        r = [list(p) for p in s]
        if r[0] != r[-1]:
            r.append(list(r[0]))
        if len(r) >= 4:
            out.append(r)
    return out

def fix_polys(polys):
    fixed = []
    for poly in polys:
        outer = split_antimeridian(poly[0])
        if len(outer) == 1:
            fixed.append(poly)
        else:
            fixed.extend([[r] for r in outer])
    return fixed

def delta(r):
    """[[lon,lat],...] -> flat ints at 1/SCALE degree, first pair absolute, rest deltas."""
    q = [(int(round(p[0]*SCALE)), int(round(p[1]*SCALE))) for p in r]
    out = [q[0][0], q[0][1]]
    for (x0,y0),(x1,y1) in zip(q, q[1:]):
        out += [x1-x0, y1-y0]
    return out

feats = []
verts = 0
geoms = [(g, 50) for g in topo["objects"]["countries"]["geometries"]]
geoms = [(g10[g["properties"]["name"]], 10) if g["properties"]["name"] in USE10 and g["properties"]["name"] in g10 else (g, s) for g, s in geoms]
geoms += [(g10[n], 10) for n in ONLY10 if n in g10]
for g, scale in geoms:
    name_ne = g["properties"]["name"]
    gid = g.get("id")
    a2 = num2a2.get(gid) if gid else None
    if not a2:
        a2 = NAME2A2.get(name_ne) or ONLY10.get(name_ne)
    A = ARCS[scale]
    if name_ne == "Vatican":
        coords = [[[round(x, 4), round(y, 4)] for x, y in VATICAN]]
        polys = [coords]
        g = {"type": "Polygon", "properties": g["properties"]}
    elif g["type"] == "Polygon":
        coords = [ring(r, A) for r in g["arcs"]]
        polys = [coords]
    elif g["type"] == "MultiPolygon":
        coords = [[ring(r, A) for r in poly] for poly in g["arcs"]]
        polys = coords
    else:
        continue
    polys = fix_polys(polys)
    if len(polys) > 1 or g["type"] == "MultiPolygon":
        g = dict(g); g["type"] = "MultiPolygon"; coords = polys
    else:
        coords = polys[0]
    xs = [p[0] for poly in polys for r in poly for p in r]
    ys = [p[1] for poly in polys for r in poly for p in r]
    verts += len(xs)
    name = en.get(a2, name_ne) if a2 else name_ne
    enc = [delta(r) for r in coords] if g["type"] == "Polygon" else [[delta(r) for r in poly] for poly in coords]
    feats.append({"n": name, "a": a2, "k": 1 if a2 in CODES194 else 0,
                  "t": g["type"], "c": enc,
                  "b": [min(xs), min(ys), max(xs), max(ys)]})

# Features that share a code (Cyprus + N. Cyprus, Somalia + Somaliland) keep one name.
# Smallest bbox first, so an enclave (Vatican, San Marino, Lesotho) wins over the
# country around it when both polygons contain the point.
feats.sort(key=lambda f: (f["b"][2] - f["b"][0]) * (f["b"][3] - f["b"][1]))
out = HERE.parent / "countries50.json"
out.write_text(json.dumps(feats, separators=(",", ":"), ensure_ascii=False))
counted = sorted({f["a"] for f in feats if f["k"]})
print("features", len(feats), "vertices", verts, "bytes", out.stat().st_size)
print("counted codes present", len(counted), "missing from data:", sorted(CODES194 - set(counted)))
print("not counted:", sorted({f["n"] for f in feats if not f["k"]}))
