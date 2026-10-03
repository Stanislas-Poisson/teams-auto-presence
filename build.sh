#!/usr/bin/env bash
# Packages the extension into dist/teams-auto-presence-X.Y.Z.zip,
# ready for "Load unpacked" sideload or Chrome Web Store upload.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
out_dir="dist"
out_zip="${out_dir}/teams-auto-presence-${version}.zip"

mkdir -p "$out_dir"
rm -f "$out_zip"

zip -r "$out_zip" \
  manifest.json \
  content-main.js \
  content-isolated.js \
  popup.html \
  popup.js \
  options.html \
  options.js \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png \
  LICENSE \
  -x '.*'

echo "built ${out_zip}"
