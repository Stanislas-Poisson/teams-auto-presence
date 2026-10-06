#!/usr/bin/env bash
# Packages the extension.
#
#   bash build.sh            both zips
#   bash build.sh chromium   dist/teams-auto-presence-X.Y.Z.zip           (Chrome, Edge, Opera, Brave)
#   bash build.sh firefox    dist/teams-auto-presence-X.Y.Z-firefox.zip   (Firefox Add-ons)
#
# The sources are the same. The Firefox zip has the keys of manifest.firefox.json added to
# manifest.json (the add-on id, the minimum version, the data collection declaration).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

target="${1:-all}"
version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
out_dir="dist"

files=(
  content-main.js
  content-isolated.js
  popup.html
  popup.js
  options.html
  options.js
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
  LICENSE
)

mkdir -p "$out_dir"

build_chromium() {
  local zip_path="${out_dir}/teams-auto-presence-${version}.zip"

  rm -f "$zip_path"
  zip -q "$zip_path" manifest.json "${files[@]}" -x '.*'
  echo "built ${zip_path}"
}

build_firefox() {
  local zip_path="${out_dir}/teams-auto-presence-${version}-firefox.zip"
  local staging
  staging=$(mktemp -d)

  # Chromium keys are kept: Firefox ignores the ones it does not know and reads the ones it does.
  python3 - "$staging/manifest.json" <<'PY'
import json, sys

def merge(base, extra):
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge(base[key], value)
        else:
            base[key] = value
    return base

manifest = merge(json.load(open('manifest.json')), json.load(open('manifest.firefox.json')))
json.dump(manifest, open(sys.argv[1], 'w'), indent=2, ensure_ascii=False)
PY

  for file in "${files[@]}"; do
    mkdir -p "$staging/$(dirname "$file")"
    cp "$file" "$staging/$file"
  done

  rm -f "$zip_path"
  (cd "$staging" && zip -q -r "$OLDPWD/$zip_path" . -x '.*')
  rm -rf "$staging"
  echo "built ${zip_path}"
}

case "$target" in
  chromium) build_chromium ;;
  firefox) build_firefox ;;
  all)
    build_chromium
    build_firefox
    ;;
  *)
    echo "usage: bash build.sh [chromium|firefox|all]" >&2
    exit 1
    ;;
esac
