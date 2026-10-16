#!/bin/sh
# Fleet Manifest – download ship images and rebuild dist/flottenmanifest.html (macOS / Linux)
# Needs Node.js 18 or newer: https://nodejs.org
set -e
cd "$(dirname "$0")/.."
node tools/fetch-ship-images.mjs "$@"
node tools/validate-ships.mjs --format
node tools/build-standalone.mjs
echo "Done. Open dist/flottenmanifest.html"
