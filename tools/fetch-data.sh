#!/bin/sh
# Downloads the inputs for build_countries.py into tools/data/.
set -e
cd "$(dirname "$0")/data"
curl -fsSLO https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
curl -fsSLO https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json
curl -fsSLO https://cdn.jsdelivr.net/npm/i18n-iso-countries@7/codes.json
ls -l
