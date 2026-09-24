# Driftlog Counter

**How many countries have you been to?** A single static web page that reads the location stored in your photos, a Google Takeout folder or a Google Maps Timeline export, and counts the countries on a world map — entirely in your browser. Nothing is uploaded.

Live: **https://driftlog-counter.pages.dev** · Japanese: https://zubotabi-counter.pages.dev

- No dependencies, no build step, no framework. One HTML file and one 890 KB border file.
- No analytics, no cookies, no third-party requests (the fonts are self-hosted). The border file is fetched as soon as the page is idle, so once it has loaded you can switch off the network and it keeps working.
- Works in iPhone Safari: the iOS photo picker passes the location along while it shows “Location Is Included”.

## What it reads

| Input | How |
|---|---|
| JPEG | EXIF in the APP1 segment. Reads the first 128 KB (1 MB if the segment is further in). |
| HEIC / HEIF / AVIF | Walks the ISO-BMFF boxes to `meta`, finds the `Exif` item in `iinf`, resolves its extent in `iloc`, and reads only those bytes. |
| TIFF-based RAW (DNG, NEF, ARW, CR2, ORF, RW2…) | The TIFF IFDs directly. |
| MOV / MP4 / M4V | The ISO 6709 location string (`+35.6812+139.7671/`) in the first or last megabyte. |
| Google Takeout (Google Photos) | The `geoData` / `geoDataExif` in the JSON next to each photo, de-duplicated against the photo itself. |
| Google Maps Timeline | Android `Timeline.json` (`"48.8584°, 2.2945°"`), iPhone `location-history.json` (`geo:48.8584,2.2945`), and the older `Records.json` (`latitudeE7`) and Semantic Location History. Read in 8 MB slices with a small overlap, so files of hundreds of megabytes are fine. |

Folders can be dropped whole; the page walks them with `webkitGetAsEntry`.

## How a coordinate becomes a country

- **Borders:** Natural Earth admin-0 at 1:50m, with about thirty small countries taken from 1:10m (Singapore, Malta, Hong Kong, the Caribbean and Pacific island states…), because at 1:110m — the usual choice for web maps — Singapore, Hong Kong, Monaco and Vatican City simply do not exist. Natural Earth draws Vatican City about a kilometre west of where it is, so it is hand-traced.
- **Lookup:** point-in-polygon (even–odd ray casting), features sorted smallest first so an enclave wins over the country around it, with a bounding-box test per feature and per polygon, and results cached per ~500 m cell.
- **Coastlines:** photos from a beach, a pier or a ferry often land just outside a simplified coastline. A point that is in no country snaps to the nearest coast within 0.12° (about 13 km); anything further out is reported, not counted.
- **The antimeridian:** rings that cross ±180° (Fiji, Russia, Kiribati) are split at build time, so neither the lookup nor the map draws a band across the world.
- **What counts:** the headline counts the 193 UN member states plus Taiwan. Territories (Hong Kong, Puerto Rico, Greenland…) are listed separately, not counted.
- **The map:** France's outline includes French Guiana and Réunion, so only parts within 1,500 km of an actual hit are painted — a trip to Paris does not paint South America.

## Run it

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node tests/run.mjs            # runs the page's own script against tests/fixtures (Node 20+)
```

The fixtures are tiny synthetic files with the coordinates of public landmarks, one per format and edge case: HEIC, a video, a Takeout sidecar, all three Timeline formats, a photo just offshore, one in the mid-Atlantic, Vatican City inside Rome, Hong Kong, Singapore.

## Rebuild the border file

```sh
tools/fetch-data.sh                 # world-atlas 50m + 10m, ISO codes
python3 tools/build_countries.py    # writes countries50.json (byte-identical to the committed one)
```

## Limits

- Borders are accurate to roughly a kilometre; a photo taken right on a border can land on the wrong side.
- Photos taken in the air or at a connecting airport can add a country you only passed through.
- EXIF dates carry no time zone, so the page only reports years.
- Android browsers remove the location from photos picked in the browser, so on Android only Timeline exports work.

## Who made this

Aki Takashima ([Shiori Studio](https://driftlog-app.pages.dev)), a solo developer in Calgary. I make **Driftlog**, an iPhone app that keeps this map up to date on its own, and the page links to it. The page itself is free and will stay that way. Bugs and odd countries: open an issue, or email shiori.sutudio@gmail.com.

## License

- Code (`index.html`, `tools/`, `tests/`): MIT, see [LICENSE](LICENSE).
- `countries50.json`: derived from [Natural Earth](https://www.naturalearthdata.com/) (public domain) via [world-atlas](https://github.com/topojson/world-atlas) (ISC), with ISO codes from [i18n-iso-countries](https://github.com/michaelwittig/node-i18n-iso-countries) (MIT).
- Fonts: [Inter](https://github.com/rsms/inter) and [Fraunces](https://github.com/undercasetype/Fraunces), SIL Open Font License 1.1 (`fonts/OFL-*.txt`).
- `app-demo.mp4`, `app-demo-poster.jpg` and `og.png` show the Driftlog app and are not covered by the MIT license.
