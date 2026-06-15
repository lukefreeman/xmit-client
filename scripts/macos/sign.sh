#!/usr/bin/env bash
# Code-sign + notarize a macOS XMIT release folder (the xmit binary + bundled mpv).
#
# One-time setup:
#   1. A "Developer ID Application" certificate in your login keychain
#      (Apple Developer account → Certificates).
#   2. Store notarization credentials once:
#        xcrun notarytool store-credentials xmit-notary \
#          --apple-id you@example.com --team-id TEAMID \
#          --password <app-specific-password>
#
# Env:
#   DEVELOPER_ID_APP   required, e.g. "Developer ID Application: Acme Inc (ABCDE12345)"
#   NOTARY_PROFILE     keychain profile name (default: xmit-notary)
#
# Usage:
#   scripts/macos/sign.sh release/xmit-macos-arm64
set -euo pipefail

DIR="${1:?usage: sign.sh <release-folder>}"
DEVID="${DEVELOPER_ID_APP:?set DEVELOPER_ID_APP to your \"Developer ID Application: …\" identity}"
PROFILE="${NOTARY_PROFILE:-xmit-notary}"
ENTITLEMENTS="$(cd "$(dirname "$0")" && pwd)/xmit.entitlements"

[ -f "$DIR/xmit" ] || { echo "✕ no xmit binary in $DIR"; exit 1; }

echo "→ signing bundled mpv (inside-out: dylibs, then binaries/bundles)"
# Sign nested dylibs first so the enclosing binary's signature stays valid.
find "$DIR" -type f -name '*.dylib' -print0 | while IFS= read -r -d '' lib; do
  codesign --force --options runtime --timestamp --sign "$DEVID" "$lib"
done
if [ -d "$DIR/mpv.app" ]; then
  codesign --force --deep --options runtime --timestamp --sign "$DEVID" "$DIR/mpv.app"
fi
if [ -f "$DIR/mpv" ]; then
  codesign --force --options runtime --timestamp --sign "$DEVID" "$DIR/mpv"
fi

echo "→ signing xmit (hardened runtime + entitlements)"
codesign --force --options runtime --timestamp \
  --entitlements "$ENTITLEMENTS" --sign "$DEVID" "$DIR/xmit"

echo "→ verifying signature"
codesign --verify --deep --strict --verbose=2 "$DIR/xmit"

ZIP="${DIR%/}.zip"
echo "→ zipping → $ZIP"
rm -f "$ZIP"
ditto -c -k --keepParent "$DIR" "$ZIP"

echo "→ notarizing (a few minutes)…"
xcrun notarytool submit "$ZIP" --keychain-profile "$PROFILE" --wait

echo "✓ notarized: $ZIP"
echo "  Note: loose binaries can't be 'stapled' — Gatekeeper validates the ticket"
echo "  online. For an offline-stapled artifact, build a .dmg/.pkg and staple that."
