#!/usr/bin/env sh
# typist-install.sh — Install Typist from GitHub releases (Linux + macOS)
#
# Downloads a prebuilt binary from the latest GitHub release — no compilation needed.
# The launcher checks for updates on every run: if a newer release exists it
# downloads and replaces the binary automatically.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/callenflynn/Typist/main/install.sh | sh
set -eu

REPO="callenflynn/Typist"
INSTALL_DIR="$HOME/.local/share/typist"
BIN_DIR="$HOME/.local/bin"
APP_NAME="typist"
OS=$(uname -s)
ARCH=$(uname -m)

echo "==> Typist installer"
echo "    OS: $OS  Arch: $ARCH"
echo "    Install dir: $INSTALL_DIR"

# ---------------------------------------------------------------------------
# 1. Detect package manager and install git + runtime dependencies
#    (Rust/Cargo NOT needed — we download a prebuilt binary)
# ---------------------------------------------------------------------------
install_deps_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y git curl libwebkit2gtk-4.0-dev libgtk-3-dev
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y git curl webkit2gtk3-devel gtk3-devel
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --needed --noconfirm git curl webkit2gtk gtk3
  else
    echo "Could not detect a supported package manager (apt/dnf/pacman)."
    echo "Please install git, curl, and WebKitGTK/GTK3 manually."
    exit 1
  fi
}

install_deps_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "==> Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  brew install git
}

case "$OS" in
  Linux)
    install_deps_linux
    ;;
  Darwin)
    install_deps_macos
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but could not be installed automatically."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Install bun
# ---------------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  echo "==> Installing bun..."
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

# ---------------------------------------------------------------------------
# 3. Determine platform asset name
# ---------------------------------------------------------------------------
case "$OS" in
  Linux)  PLATFORM="linux" ;;
  Darwin) PLATFORM="macos" ;;
esac

# ---------------------------------------------------------------------------
# 4. Fetch latest release tag from GitHub API
# ---------------------------------------------------------------------------
echo "==> Checking latest release on GitHub..."
LATEST_TAG=$(curl -fsS "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name":' \
  | sed -E 's/.*"tag_name": "([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  echo "Could not fetch latest release from GitHub. Check your network connection."
  exit 1
fi
echo "    Latest release: $LATEST_TAG"

# ---------------------------------------------------------------------------
# 5. Download prebuilt binary
# ---------------------------------------------------------------------------
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

ASSET_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/typist-${PLATFORM}"
BINARY_PATH="$INSTALL_DIR/$APP_NAME"

echo "==> Downloading typist-$PLATFORM..."
curl -fsSL -o "$BINARY_PATH" "$ASSET_URL"
chmod +x "$BINARY_PATH"

# ---------------------------------------------------------------------------
# 6. Symlink into PATH
# ---------------------------------------------------------------------------
ln -sf "$BINARY_PATH" "$BIN_DIR/$APP_NAME"

# ---------------------------------------------------------------------------
# 7. Write the update-checking launcher
# ---------------------------------------------------------------------------
LAUNCHER="$BIN_DIR/typist-launch"
cat > "$LAUNCHER" << LAUNCH_EOF
#!/usr/bin/env sh
# typist-launch — launch Typist, auto-updating from GitHub releases if needed
set -eu
REPO="${REPO}"
INSTALL_DIR="${INSTALL_DIR}"
BIN_DIR="${BIN_DIR}"
APP_NAME="${APP_NAME}"
PLATFORM="${PLATFORM}"
BINARY="\$INSTALL_DIR/\$APP_NAME"
CURRENT_VERSION_FILE="\$INSTALL_DIR/.version"

# Read current version (if any)
CURRENT_VERSION=""
if [ -f "\$CURRENT_VERSION_FILE" ]; then
  CURRENT_VERSION=\$(cat "\$CURRENT_VERSION_FILE" 2>/dev/null || true)
fi

# Fetch latest release tag
LATEST_TAG=\$(curl -fsS "https://api.github.com/repos/\$REPO/releases/latest" 2>/dev/null \
  | grep '"tag_name":' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/' || true)

# If we have a newer release, download and replace
if [ -n "\$LATEST_TAG" ] && [ "\$CURRENT_VERSION" != "\$LATEST_TAG" ]; then
  echo "==> Typist update available: \$LATEST_TAG (current: \$CURRENT_VERSION)"
  ASSET_URL="https://github.com/\$REPO/releases/download/\$LATEST_TAG/typist-\$PLATFORM"
  TMP_BIN="\$INSTALL_DIR/.typist-new"
  curl -fsSL -o "\$TMP_BIN" "\$ASSET_URL"
  chmod +x "\$TMP_BIN"
  mv "\$TMP_BIN" "\$BINARY"
  echo "\$LATEST_TAG" > "\$CURRENT_VERSION_FILE"
  echo "==> Typist updated to \$LATEST_TAG"
fi

exec "\$BINARY" "\$@"
LAUNCH_EOF
chmod +x "$LAUNCHER"

# Point the PATH symlink at the launcher so updates run on every launch
ln -sf "$LAUNCHER" "$BIN_DIR/$APP_NAME"

# ---------------------------------------------------------------------------
# 8. Record installed version
# ---------------------------------------------------------------------------
echo "$LATEST_TAG" > "$INSTALL_DIR/.version"

# ---------------------------------------------------------------------------
# 9. Linux: create .desktop file
# ---------------------------------------------------------------------------
if [ "$OS" = "Linux" ]; then
  DESKTOP_DIR="$HOME/.local/share/applications"
  mkdir -p "$DESKTOP_DIR"
  cat > "$DESKTOP_DIR/typist.desktop" << DESKTOP_EOF
[Desktop Entry]
Name=Typist
Comment=Minimal local-first daily journal
Exec=$BIN_DIR/$APP_NAME
Icon=$INSTALL_DIR/src-tauri/icons/icon.png
Terminal=false
Type=Application
Categories=Office;TextEditor;
DESKTOP_EOF
  echo "==> .desktop installed to $DESKTOP_DIR/typist.desktop"
fi

# ---------------------------------------------------------------------------
# 10. macOS note
# ---------------------------------------------------------------------------
if [ "$OS" = "Darwin" ]; then
  echo "==> Done! Typist is installed at $BIN_DIR/$APP_NAME"
  echo "    Run: typist"
  echo "    Each launch checks GitHub and auto-updates if a new release exists."
fi

echo
echo "==> Install complete."
echo "    Launch Typist from your app menu, or run: typist"
echo "    Each launch checks GitHub and auto-updates if a new release exists."
