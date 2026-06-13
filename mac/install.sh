#!/usr/bin/env bash
#
# GenNal — macOS installer
# Builds the app from source and installs it to /Applications.
# Native modules (node-pty) and .dmg packaging are macOS-only, so this
# MUST be run on a Mac (it will not work on Windows or Linux).
#
# Usage (from the repo root):
#   bash mac/install.sh
#
set -euo pipefail

# Move to repo root regardless of where the script is called from.
cd "$(dirname "$0")/.."

if [ "$(uname)" != "Darwin" ]; then
  echo "!! This installer must be run on macOS (uname reported '$(uname)')." >&2
  echo "   On Windows use: npm run dist:win" >&2
  exit 1
fi

echo "==> Installing dependencies (compiles node-pty for macOS)…"
npm install

echo "==> Building the macOS app + .dmg…"
npm run dist:mac

# electron-builder places the unpacked app under dist/mac-<arch>/ (arm64) or dist/mac/ (x64).
APP_PATH="$(/usr/bin/find dist -maxdepth 2 -name 'GenNal.app' -type d | head -n1)"
if [ -z "${APP_PATH}" ]; then
  echo "!! Build finished but no GenNal.app was found under dist/. Check the output above." >&2
  exit 1
fi

echo "==> Installing ${APP_PATH} → /Applications/GenNal.app …"
rm -rf "/Applications/GenNal.app"
cp -R "${APP_PATH}" /Applications/

# The build is unsigned; clear the Gatekeeper quarantine flag so it opens cleanly.
xattr -cr "/Applications/GenNal.app" || true

echo ""
echo "✓ GenNal installed to /Applications."
echo "  Launch it from Launchpad/Applications, or run:  open -a GenNal"
echo "  Distributable installers are in ./dist :  GenNal-*-arm64.dmg / GenNal-*-x64.dmg"
