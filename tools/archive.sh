#!/usr/bin/env bash
# Pack the playable project (no node_modules, no .git) into dist/pautina.zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p dist /opt/cursor/artifacts
STAMP="$(date -u +%Y%m%d)"
ARCHIVE="dist/pautina-${STAMP}.zip"
zip -r "$ARCHIVE" index.html styles.css README.md .gitignore src tools -x "*.DS_Store"
cp "$ARCHIVE" dist/pautina.zip
cp "$ARCHIVE" /opt/cursor/artifacts/pautina.zip
cp "$ARCHIVE" "/opt/cursor/artifacts/pautina-${STAMP}.zip"
echo "Wrote $ARCHIVE ($(du -h dist/pautina.zip | cut -f1))"
