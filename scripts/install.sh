#!/usr/bin/env bash
# Installs Murmur for the current user:
#   - npm dependencies (Electron)
#   - whisper.cpp (built with Vulkan) unless it is already there
#   - `murmur` command in ~/.local/bin
#   - desktop entry and a systemd user service that keeps it running
# Nothing outside your home directory is touched, and your Hyprland config is
# only changed later, when you click "Add to Hyprland" in the app.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}"

for cmd in node npm pw-record wtype wl-copy hyprctl; do
  command -v "$cmd" >/dev/null || { echo "missing: $cmd" >&2; exit 1; }
done

cd "$ROOT"
npm install --no-fund --no-audit

if [ ! -x "$DATA/murmur/bin/whisper-server" ]; then
  "$ROOT/scripts/build-whisper.sh" "$@"
fi

mkdir -p "$HOME/.local/bin"
ln -sf "$ROOT/bin/murmur.js" "$HOME/.local/bin/murmur"
chmod +x "$ROOT/bin/murmur.js"

mkdir -p "$DATA/applications" "$DATA/icons/hicolor/scalable/apps"
cp "$ROOT/assets/icon.svg" "$DATA/icons/hicolor/scalable/apps/murmur.svg"
cat > "$DATA/applications/murmur.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Murmur
Comment=Local Whisper dictation. Hold a shortcut, talk, let go to type.
Exec=$HOME/.local/bin/murmur open
Icon=murmur
Categories=Utility;Accessibility;
StartupWMClass=murmur
DESKTOP

mkdir -p "$CONF/systemd/user"
cat > "$CONF/systemd/user/murmur.service" <<UNIT
[Unit]
Description=Murmur dictation
PartOf=graphical-session.target
After=graphical-session.target

[Service]
UnsetEnvironment=ELECTRON_RUN_AS_NODE
ExecStart=$ROOT/node_modules/electron/dist/electron $ROOT --hidden
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical-session.target
UNIT
systemctl --user daemon-reload

echo
echo "Installed. Start it now and on every login with:"
echo "  systemctl --user enable --now murmur.service"
echo "or just run: murmur open"
