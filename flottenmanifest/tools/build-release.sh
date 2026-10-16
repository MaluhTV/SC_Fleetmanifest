#!/bin/sh
# Fleet Manifest – build a release file that shows the ship images straight from RSI (macOS / Linux)
# No image files are embedded or stored, only links. Needs Node.js 18 or newer: https://nodejs.org
set -e
cd "$(dirname "$0")/.."
node tools/fetch-ship-images.mjs --urls-only "$@"
node tools/build-standalone.mjs --remote-images
echo "Done. dist/flottenmanifest.html is ready to attach to a GitHub release."
