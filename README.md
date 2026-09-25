# Driftlog Counter

**How many countries have you been to?** A single static web page that reads the location stored in your photos, a Google Takeout folder or a Google Maps Timeline export, and counts the countries on a world map — entirely in your browser. Nothing is uploaded.

Live: **https://driftlog-counter.pages.dev** · Japanese: https://zubotabi-counter.pages.dev

- No dependencies, no build step, no framework. One HTML file, one script (`kit.js`: the country list, result links, map drawing, sharing, the country picker and the passport page's drawing) and one 890 KB border file.
- No analytics, no cookies, no third-party requests (the fonts are self-hosted). The only requests are for the page and its script, its fonts, the border file and a short demo video of the app. The border file is fetched as soon as the page is idle, so once it has loaded you can switch off the network and it keeps working.
- Works in iPhone Safari: the iOS photo picker passes the location along while it shows “Location Is Included”.

## What it reads

| Input | How |
|---|---|
| JPEG | EXIF in the APP1 segment. Reads the first 128 KB (1 MB if the segment is further in). |
| HEIC / HEIF / AVIF | Reads the first 512 KB to walk the ISO-BMFF boxes to `meta`, finds the `Exif` item in `iinf`, resolves its extent in `iloc`, then reads that extent. The image itself is never decoded. |
| TIFF-based RAW (DNG, NEF, ARW, CR2, ORF, RW2…) | The TIFF IFDs directly, including the Olympus and Panasonic header variants. |
| MOV / MP4 / M4V | The ISO 6709 location string (`+35.6812+139.7671/`) in the first or last megabyte. |
| Google Takeout (Google Photos) | The `geoData` / `geoDataExif` in the JSON next to each photo. A sidecar is skipped when a file with the same name already put the same country on the map. |
| Google Maps Timeline | Android `Timeline.json` (`"48.8584°, 2.2945°"`), iPhone `location-history.json` (`geo:48.8584,2.2945`), and the older `Records.json` (`latitudeE7`) and Semantic Location History. Read in 8 MB slices, carrying over from the end of the last coordinate read, so files of hundreds of megabytes are fine. |

Folders can be dropped whole; the page walks them with `webkitGetAsEntry`.

## How a coordinate becomes a country

- **Borders:** Natural Earth admin-0 at 1:50m, with about thirty small countries taken from 1:10m (Singapore, Malta, Hong Kong, the Caribbean and Pacific island states…), because at 1:110m — the usual choice for web maps — Singapore, Hong Kong, Monaco and Vatican City simply do not exist. Natural Earth draws Vatican City about a kilometre west of where it is, so it is hand-traced.
- **Lookup:** point-in-polygon (even–odd ray casting), features sorted smallest first so an enclave wins over the country around it, with a bounding-box test per feature and per polygon, and results cached per ~500 m cell.
- **Coastlines:** photos from a beach, a pier or a ferry often land just outside a simplified coastline. A point that is in no country snaps to the nearest coast within 0.12° (about 13 km); anything further out is reported, not counted.
- **The antimeridian:** rings that cross ±180° (Fiji, Russia, Kiribati) are split at build time, so neither the lookup nor the map draws a band across the world.
- **What counts:** the headline counts the 193 UN member states plus Taiwan. Other places (Vatican City, Kosovo, and territories such as Hong Kong, Puerto Rico or Greenland) are listed and filled in on the map, not counted. A few small outlying areas follow their parent in the border data (Christmas Island and the Cocos Islands with Australia, the UK Sovereign Base Areas with Cyprus).
- **The map:** France's outline includes French Guiana and Réunion, so only parts within 1,500 km of an actual hit are painted — a trip to Paris does not paint South America.

## Run it

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node tests/run.mjs            # runs the page's own script against tests/fixtures (Node 20+)
node tests/share.mjs          # result links, the country table and comparing two lists
node tests/passport.mjs       # the passport page: stamps, grid, captions, links and the page's own script
```

The test also generates an old-style `Records.json` (with `timestampMs`) and 65 Timeline files just over one 8 MB slice, so a coordinate straddles the slice boundary at every possible offset.

The fixtures in `tests/fixtures` are tiny synthetic files with the coordinates of public landmarks, one per format and edge case: HEIC, a video, a Takeout sidecar, all three Timeline formats, a photo just offshore, one in the mid-Atlantic, Vatican City inside Rome, Hong Kong, Singapore.

## Rebuild the border file

```sh
tools/fetch-data.sh                 # world-atlas 50m + 10m, ISO codes
python3 tools/build_countries.py    # writes countries50.json (byte-identical to the committed one)
```

## Result links and comparing

A result can be shared as a link that carries the countries, and whoever opens it sees that map and can compare it with their own: pick countries by hand (search, or tap through the regions) or count them from photos.

```
https://driftlog-counter.pages.dev/c/37/#v=1.hADHYCgAAgBAgEwGSAA…
```

- **What the server sees.** Only the number is in the path (`/c/37/`), so the host, and any link preview, sees that number. The country list is after the `#`, which browsers never send to any server; the page reads it in the browser. Anyone who has the link can read the list.
- **The list.** One bit per country for the 193 UN member states plus Taiwan, in ISO 3166-1 alpha-2 order, six bits per base64url character, trailing zero characters dropped: 33 characters at most. `v=1` is the version; a link with another version, bad characters or bits past the 194th country, or a `#` longer than 512 characters, is ignored and the plain counter opens. An optional `&y=` carries a first-visit year per country (one character each, 1976–2038); the share buttons do not add it. Unknown `key=value` parts are ignored.
- **The `/c/<N>/` pages** (N = 0–194) exist only for link previews, which fetch the page without the `#` and run no scripts: each has its own Open Graph tags and image (`/c/og/<N>.png`) and forwards to the counter with the `#`. They are `noindex` with a canonical to the top page and are not in the sitemap. They are generated, not committed: `python3 tools/build_share_pages.py .` (Pillow; uses `fonts/` and `countries50.json`).
- **The order is fixed.** Links already shared depend on the order of the table in `kit.js` (generated from `countries50.json` by `tools/build_kit_table.py`), so it never changes within version 1. `tests/share.mjs` pins it.

## The passport page

`/passport/` makes a 9:16 image (1080 × 1920) with a passport-style stamp for each country, for a story or a camera roll.

- **The way in** is the same country picker (search, or tap through the regions). From the counter, **Make my passport page** under a result opens it with the list after the `#`: `/passport/#v=1.<mask>&y=<years>&s=<where it came from>`. It opens in the same tab, so none of that reaches a server; the page then keeps only `v=` in the address bar and holds the years and the source in this tab's `sessionStorage` for a reload.
- **The order** is the first year each country turns up in the photos or Timeline file; within a year, and without one, by region (Europe, Asia, North America, South America, Africa, Oceania), then by name. Picked by hand, there are no years.
- **The caption** says "counted from my photos" (or location history) only when the list was counted that way. A list picked by hand says only `194 = 193 UN members + Taiwan`.
- **The stamps** are four 7 × 7 sheets (`stamps/sheet-<k>.webp`, 240 px per stamp, about 520 KB in all) in the order of the table in `kit.js`. The page fetches all four once someone starts picking or arrives with a list, whichever countries they pick, so the requests say nothing about the list. They are drawn onto the one canvas the page has; the tilt of each stamp is the one the app gives it.
- **Saving:** the share sheet with the PNG where the browser has one, otherwise a download.
- `tools/build_passport_og.py` draws `passport/og.png` from the sheets and the site's fonts.

## Limits

- Borders are accurate to roughly a kilometre; a photo taken right on a border can land on the wrong side.
- Photos taken in the air or at a connecting airport can add a country you only passed through.
- EXIF dates carry no time zone, so the page only reports years.
- Android browsers remove the location from photos picked in the browser, so on Android only Timeline exports work.

## Who made this

Aki Takashima ([Shiori Studio](https://driftlog-app.pages.dev)), a solo developer in Calgary. I make **Driftlog**, an iPhone app that keeps this map up to date on its own, and the page links to it. The page itself is free and will stay that way. Bugs and odd countries: open an issue, or email shiori.sutudio@gmail.com.

## License

- Code (`index.html`, `kit.js`, `tools/`, `tests/`): MIT, see [LICENSE](LICENSE).
- `countries50.json`: derived from [Natural Earth](https://www.naturalearthdata.com/) (public domain) via [world-atlas](https://github.com/topojson/world-atlas) (ISC), with ISO codes from [i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries) (MIT). Their notices are in [NOTICE](NOTICE).
- Fonts: [Inter](https://github.com/rsms/inter) and [Fraunces](https://github.com/undercasetype/Fraunces), SIL Open Font License 1.1 (`fonts/OFL-*.txt`).
- `app-demo.mp4`, `app-demo-poster.jpg` and `og.png` show the Driftlog app and are not covered by the MIT license.
- `stamps/` and `passport/og.png`: the Driftlog app's stamp drawings, not covered by the MIT license. They are the stamps of the [194-stamp poster](https://driftlog-app.pages.dev/stamps/), which is free to use and to republish, credit optional.
