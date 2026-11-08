#!/usr/bin/env sh
# typist-install.sh — Install Typist from GitHub releases (Linux + macOS only)
#
# This script installs Typist on Linux and macOS by downloading a prebuilt
# binary from the latest GitHub release. The Windows installer is
# install.bat (run via PowerShell one-liner).
#
# On every launch the launcher checks GitHub for a new release and
# auto-updates the binary if one is available.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/callenflynn/Typist/main/install.sh | sh
set -eu

REPO="callenflynn/Typist"
INSTALL_DIR="$HOME/.local/share/typist"
BIN_DIR="$HOME/.local/bin"
APP_NAME="typist"

echo "==> Typist installer (Linux/macOS)"
echo "    REPO: $REPO"
echo "    Install dir: $INSTALL_DIR"

# ---------------------------------------------------------------------------
# 1. Install git (via apt/dnf/pacman).  On macOS we use Homebrew.
# ---------------------------------------------------------------------------
install_git_linux() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq git curl
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y -q git curl
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --needed --noconfirm git curl
  else
    echo "Could not detect a supported package manager (apt/dnf/pacman)."
    echo "Please install git and curl manually, then re-run."
    exit 1
  fi
}

install_git_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    echo "==> Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  brew install git --quiet 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# 2. Detect OS and install dependencies
# ---------------------------------------------------------------------------
OS=$(uname -s)
CASE=$OS
if [ "$OS" = "Darwin" ]; then
  install_git_macos
elif [ "$OS" = "Linux" ]; then
  install_git_linux
else
  echo "Unsupported OS: $OS. This script supports Linux and macOS only."
  echo "Windows users: run the PowerShell one-liner from the README."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but could not be installed automatically."
  exit 1
fi
echo "    git ready: $(git --version)"

# ---------------------------------------------------------------------------
# 3. Install bun
# ---------------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  echo "==> Installing bun..."
  curl -fsSL https://bun.sh/install | bash
fi
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"
echo "    bun ready: $(bun --version)"

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

# Determine platform asset name
ASSET_NAME="typist-$(uname -s | tr '[:upper:]' '[:lower:]')"
ASSET_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${ASSET_NAME}"

echo "==> Downloading $ASSET_NAME..."
curl -fsSL -o "$INSTALL_DIR/$APP_NAME" "$ASSET_URL"
chmod +x "$INSTALL_DIR/$APP_NAME"

# ---------------------------------------------------------------------------
# 6. Symlink into PATH
# ---------------------------------------------------------------------------
ln -sf "$INSTALL_DIR/$APP_NAME" "$BIN_DIR/$APP_NAME"

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
BINARY="\$INSTALL_DIR/\$APP_NAME"
CURRENT_VERSION_FILE="\$INSTALL_DIR/.version"

# Read current version
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
  ASSET_URL="https://github.com/\$REPO/releases/download/\$LATEST_TAG/typist-\$(uname -s | tr '[:upper:]' '[:lower:]')"
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
# 10. Finish
# ---------------------------------------------------------------------------
echo
echo "==> Install complete."
echo "    Launch Typist from your app menu, or run: typist"
echo "    Each launch checks GitHub and auto-updates if a new release exists."
