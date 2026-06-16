# Homebrew formula for XMIT. Copy this into your tap repo
# (github.com/lukefreeman/homebrew-xmit as Formula/xmit.rb), then bump `version`,
# the release URLs, and the sha256s each release. Users install with:
#
#   brew install lukefreeman/xmit/xmit
#
# Get the sha256s:  shasum -a 256 release/xmit-macos-arm64.zip
class Xmit < Formula
  desc "Underground terminal music station"
  homepage "https://github.com/lukefreeman/xmit-client"
  version "0.1.2"

  on_macos do
    on_arm do
      url "https://github.com/lukefreeman/xmit-client/releases/download/v0.1.2/xmit-macos-arm64.zip"
      sha256 "REPLACE_WITH_ARM64_SHA256"
    end
    on_intel do
      url "https://github.com/lukefreeman/xmit-client/releases/download/v0.1.2/xmit-macos-x64.zip"
      sha256 "REPLACE_WITH_X64_SHA256"
    end
  end

  def install
    # Keep the binary + bundled mpv together; expose `xmit` on PATH as a symlink
    # (process.execPath resolves through it, so it still finds the co-located mpv).
    libexec.install Dir["*"]
    bin.install_symlink libexec/"xmit"
  end

  test do
    assert_predicate libexec/"xmit", :exist?
  end
end
