#!/bin/sh
# XMIT installer. Downloads the right release for this machine, installs it
# (binary + bundled mpv together), and symlinks `xmit` onto PATH.
#
#   curl -fsSL https://raw.githubusercontent.com/YOU/xmit/main/packaging/install.sh | sh
#
# Overrides: XMIT_REPO (owner/repo), XMIT_HOME (install dir), XMIT_BIN (symlink dir).
set -eu

REPO="${XMIT_REPO:-YOU/xmit}"
HOME_DIR="${XMIT_HOME:-$HOME/.xmit}"
BIN_DIR="${XMIT_BIN:-$HOME/.local/bin}"

os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin)
    case "$arch" in
      arm64) asset="xmit-macos-arm64" ;;
      x86_64) asset="xmit-macos-x64" ;;
      *) echo "unsupported macOS arch: $arch" >&2; exit 1 ;;
    esac ;;
  Linux)
    case "$arch" in
      x86_64) asset="xmit-linux-x64" ;;
      aarch64|arm64) asset="xmit-linux-arm64" ;;
      *) echo "unsupported Linux arch: $arch" >&2; exit 1 ;;
    esac ;;
  *) echo "unsupported OS: $os (Windows: use the .zip from Releases)" >&2; exit 1 ;;
esac

url="https://github.com/$REPO/releases/latest/download/$asset.zip"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "→ downloading $url"
curl -fsSL "$url" -o "$tmp/xmit.zip"
unzip -q "$tmp/xmit.zip" -d "$tmp"

rm -rf "$HOME_DIR"
mkdir -p "$HOME_DIR"
# the archive contains a single xmit-<platform>/ folder
inner="$(find "$tmp" -maxdepth 1 -type d -name 'xmit-*' | head -1)"
cp -R "${inner:-$tmp}/." "$HOME_DIR/"
chmod +x "$HOME_DIR/xmit" 2>/dev/null || true

mkdir -p "$BIN_DIR"
ln -sf "$HOME_DIR/xmit" "$BIN_DIR/xmit"

echo "✓ installed to $HOME_DIR"
echo "  symlinked $BIN_DIR/xmit"
case ":$PATH:" in
  *":$BIN_DIR:"*) echo "  run: xmit" ;;
  *) echo "  add $BIN_DIR to your PATH, then run: xmit" ;;
esac
