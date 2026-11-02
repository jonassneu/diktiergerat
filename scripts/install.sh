#!/usr/bin/env bash
# Installs Murmur for the current user, on any common Linux distribution
# (Fedora, Nobara, Ubuntu, Debian, Linux Mint, Pop!_OS, Arch, CachyOS, Manjaro,
# EndeavourOS, openSUSE) and desktop (KDE Plasma, GNOME, Hyprland, Sway,
# Xfce, Cinnamon, ...):
#
#   - system packages it needs (asks for your password once, via sudo)
#   - Node.js, only inside Murmur's folder if your system one is too old
#   - Electron and the other npm dependencies
#   - whisper.cpp, built for your graphics card (CUDA, Vulkan) or the CPU
#   - on GNOME/KDE Wayland: ydotool, so Murmur can type into other apps
#   - the `murmur` command, a menu entry and a background service
#
# Options:
#   --cuda | --vulkan | --cpu   pick the whisper backend instead of guessing
#   --no-deps                   do not install system packages
#   --rebuild                   build whisper.cpp again even if it is there
#   --dry-run                   only print what would be done
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
MDATA="$DATA/murmur"
NODE_MIN="22.12.0"

BACKEND=""
DEPS=1
REBUILD=0
DRY=0
for arg in "$@"; do
  case "$arg" in
    --cuda) BACKEND=cuda ;;
    --vulkan) BACKEND=vulkan ;;
    --cpu) BACKEND=cpu ;;
    --no-deps) DEPS=0 ;;
    --rebuild) REBUILD=1 ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

bold() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '\033[33m    ! %s\033[0m\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
run() { if [ "$DRY" = 1 ]; then echo "    [dry-run] $*"; else "$@"; fi; }
sudo_run() {
  if [ "$(id -u)" = 0 ]; then run "$@"; else run sudo "$@"; fi
}

if [ "$(id -u)" = 0 ]; then
  echo "Run this as your normal user, not as root. It asks for sudo when it needs it." >&2
  exit 1
fi

# ---------- what are we on ----------

DISTRO="linux"
[ -r /etc/os-release ] && . /etc/os-release && DISTRO="${PRETTY_NAME:-${NAME:-linux}}"
DESKTOP_RAW="${XDG_CURRENT_DESKTOP:-${XDG_SESSION_DESKTOP:-${DESKTOP_SESSION:-}}}"
DESKTOP_LC="$(echo "$DESKTOP_RAW" | tr '[:upper:]' '[:lower:]')"
SESSION="${XDG_SESSION_TYPE:-}"
[ -z "$SESSION" ] && { [ -n "${WAYLAND_DISPLAY:-}" ] && SESSION=wayland || SESSION=x11; }

case "$DESKTOP_LC" in
  *hyprland*) DESK=hyprland ;;
  *sway*) DESK=sway ;;
  *kde*|*plasma*) DESK=kde ;;
  *gnome*|*ubuntu*|*pop*|*unity*|*budgie*) DESK=gnome ;;
  *cinnamon*) DESK=cinnamon ;;
  *niri*|*river*|*wayfire*|*labwc*) DESK=wlroots ;;
  *) DESK=other ;;
esac
[ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ] && DESK=hyprland

# How Murmur will press keys here (see src/main/keys.js).
if [ "$SESSION" = x11 ]; then TYPER=xdotool
elif [ "$DESK" = hyprland ] || [ "$DESK" = sway ] || [ "$DESK" = wlroots ]; then TYPER=wtype
else TYPER=ydotool
fi

PM=""
for p in dnf apt-get pacman zypper; do have "$p" && { PM="$p"; break; }; done

bold "Murmur installer"
note "System:  $DISTRO"
note "Desktop: ${DESKTOP_RAW:-unknown} ($SESSION)"
note "Typing:  $TYPER"
note "Folder:  $ROOT"

# ---------- system packages ----------

pkgs_for() {
  # core: build tools, audio, clipboard, typing; then Vulkan build bits.
  case "$PM" in
    dnf) echo "git cmake gcc-c++ make curl xz tar pipewire-utils pulseaudio-utils wl-clipboard $TYPER vulkan-headers vulkan-loader-devel glslc" ;;
    apt-get) echo "git cmake g++ make curl xz-utils tar pipewire-bin pulseaudio-utils wl-clipboard $TYPER libvulkan-dev glslc" ;;
    pacman) echo "git cmake base-devel curl xz tar pipewire libpulse wl-clipboard $TYPER vulkan-headers vulkan-icd-loader shaderc" ;;
    zypper) echo "git cmake gcc-c++ make curl xz tar pipewire-tools pulseaudio-utils wl-clipboard $TYPER vulkan-devel shaderc" ;;
  esac
}

pm_install() {
  case "$PM" in
    dnf) sudo_run dnf install -y "$@" ;;
    apt-get) sudo_run apt-get install -y "$@" ;;
    pacman) sudo_run pacman -S --needed --noconfirm "$@" ;;
    zypper) sudo_run zypper --non-interactive install "$@" ;;
  esac
}

if [ "$DEPS" = 1 ]; then
  bold "System packages"
  if [ -z "$PM" ]; then
    warn "Unknown package manager. Please install these yourself:"
    warn "git cmake a C++ compiler, curl, pipewire (pw-record) or pulseaudio-utils, wl-clipboard, $TYPER, Vulkan headers + glslc (optional)"
  else
    PKGS="$(pkgs_for)"
    note "$PM: $PKGS"
    [ "$PM" = apt-get ] && sudo_run apt-get update -qq
    # One go first; if a name is unknown on this release, fall back to one by one.
    if ! pm_install $PKGS; then
      warn "Some packages failed, installing them one by one"
      for p in $PKGS; do pm_install "$p" >/dev/null 2>&1 || warn "not available: $p"; done
    fi
  fi
fi

for cmd in git cmake curl; do
  have "$cmd" || { echo "missing: $cmd. Install it and run this again." >&2; exit 1; }
done
have c++ || have g++ || have clang++ || { echo "missing: a C++ compiler (g++). Install it and run this again." >&2; exit 1; }
have pw-record || have parecord || have arecord || warn "No audio recorder found (pw-record, parecord or arecord)."

# ---------- Node.js (only needed to install, Murmur runs on Electron's) ----------

version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

bold "Node.js"
NODE=""
if have node && have npm && version_ge "$(node -p process.versions.node)" "$NODE_MIN"; then
  NODE="$(command -v node)"
  note "Using system Node $(node -v)"
elif [ -x "$MDATA/node/bin/node" ] && version_ge "$("$MDATA/node/bin/node" -p process.versions.node)" "$NODE_MIN"; then
  NODE="$MDATA/node/bin/node"
  note "Using Murmur's own Node $("$NODE" -v)"
else
  case "$(uname -m)" in
    x86_64) NARCH=x64 ;;
    aarch64|arm64) NARCH=arm64 ;;
    *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
  esac
  note "System Node is missing or older than $NODE_MIN, downloading Node 22 into $MDATA/node"
  if [ "$DRY" = 0 ]; then
    TMP="$(mktemp -d)"
    BASE="https://nodejs.org/dist/latest-v22.x"
    curl -fsSL "$BASE/SHASUMS256.txt" -o "$TMP/SUMS"
    FILE="$(grep -o "node-v[0-9.]*-linux-$NARCH.tar.xz" "$TMP/SUMS" | head -1)"
    curl -fL --progress-bar "$BASE/$FILE" -o "$TMP/$FILE"
    (cd "$TMP" && grep " $FILE\$" SUMS | sha256sum -c --status) || { echo "Node download checksum mismatch" >&2; exit 1; }
    rm -rf "$MDATA/node" && mkdir -p "$MDATA/node"
    tar -xJf "$TMP/$FILE" -C "$MDATA/node" --strip-components=1
    rm -rf "$TMP"
  fi
  NODE="$MDATA/node/bin/node"
fi
NPM="$(dirname "$NODE")/npm"
[ -x "$NPM" ] || NPM="$(command -v npm)"

# ---------- npm + Electron ----------

bold "Electron and dependencies"
cd "$ROOT"
run env PATH="$(dirname "$NODE"):$PATH" "$NPM" install --no-fund --no-audit --omit=optional
# Electron 45 fetches its binary in a separate step.
if [ ! -x "$ROOT/node_modules/electron/dist/electron" ]; then
  run env PATH="$(dirname "$NODE"):$PATH" "$NODE" "$ROOT/node_modules/electron/install.js"
fi
ELECTRON="$ROOT/node_modules/electron/dist/electron"

# ---------- whisper.cpp ----------

find_nvcc() {
  for c in nvcc /opt/cuda/bin/nvcc /usr/local/cuda/bin/nvcc; do
    if have "$c" || [ -x "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}
vulkan_ok() {
  have glslc || return 1
  ldconfig -p 2>/dev/null | grep -q 'libvulkan.so' || ls /usr/lib*/libvulkan.so* /usr/lib/*/libvulkan.so* >/dev/null 2>&1
}

if [ -z "$BACKEND" ]; then
  if have nvidia-smi && nvidia-smi -L >/dev/null 2>&1 && find_nvcc >/dev/null; then BACKEND=cuda
  elif vulkan_ok; then BACKEND=vulkan
  else BACKEND=cpu
  fi
fi

bold "whisper.cpp ($BACKEND)"
BUILT="$(cat "$MDATA/bin/backend" 2>/dev/null || true)"
if [ "$REBUILD" = 1 ] || [ ! -x "$MDATA/bin/whisper-server" ] || [ "$BUILT" != "$BACKEND" ]; then
  if [ "$BACKEND" = cuda ]; then
    NVCC="$(find_nvcc)"
    case "$NVCC" in /*) export PATH="$(dirname "$NVCC"):$PATH" ;; esac
  fi
  if ! run "$ROOT/scripts/build-whisper.sh" "--$BACKEND"; then
    if [ "$BACKEND" != cpu ]; then
      warn "The $BACKEND build failed, building for the CPU instead (slower, but works everywhere)"
      run "$ROOT/scripts/build-whisper.sh" --cpu
    else
      exit 1
    fi
  fi
else
  note "Already built ($BUILT). Use --rebuild to build again."
fi

# ---------- typing on GNOME / KDE Wayland ----------

if [ "$TYPER" = ydotool ]; then
  bold "Typing support (ydotool)"
  if ! have ydotool || ! have ydotoold; then
    warn "ydotool is not installed, so Murmur will copy text to the clipboard instead of typing it."
  else
    # Lets the logged-in user (and only them) create a virtual keyboard,
    # without adding them to the input group.
    note "Allowing your session to use /dev/uinput"
    if [ "$DRY" = 1 ]; then
      echo "    [dry-run] write /etc/udev/rules.d/60-murmur-uinput.rules and /etc/modules-load.d/murmur-uinput.conf"
    else
      echo 'KERNEL=="uinput", SUBSYSTEM=="misc", TAG+="uaccess", OPTIONS+="static_node=uinput"' | sudo tee /etc/udev/rules.d/60-murmur-uinput.rules >/dev/null
      echo uinput | sudo tee /etc/modules-load.d/murmur-uinput.conf >/dev/null
    fi
    sudo_run modprobe uinput || true
    sudo_run udevadm control --reload-rules
    sudo_run udevadm trigger --sysname-match=uinput || true

    YDOTOOLD="$(command -v ydotoold)"
    if "$YDOTOOLD" --help 2>&1 | grep -q -- '--socket-path'; then
      YEXEC="$YDOTOOLD --socket-path=%t/.ydotool_socket --socket-perm=0600"
    else
      YEXEC="$YDOTOOLD"
    fi
    if [ "$DRY" = 0 ]; then
      mkdir -p "$CONF/systemd/user"
      cat > "$CONF/systemd/user/murmur-ydotoold.service" <<UNIT
[Unit]
Description=ydotool daemon for Murmur (virtual keyboard)
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=$YEXEC
Restart=on-failure
RestartSec=2

[Install]
WantedBy=graphical-session.target
UNIT
      systemctl --user daemon-reload
      systemctl --user enable murmur-ydotoold.service >/dev/null 2>&1 || true
      systemctl --user restart murmur-ydotoold.service || warn "ydotoold did not start yet; it will after the next login"
    fi
  fi
fi

# ---------- command, menu entry, service ----------

bold "Command, menu entry and background service"
if [ "$DRY" = 0 ]; then
  mkdir -p "$HOME/.local/bin"
  # Older installs linked bin/murmur.js here; replace the link, not its target.
  rm -f "$HOME/.local/bin/murmur"
  cat > "$HOME/.local/bin/murmur" <<WRAP
#!/bin/sh
# Murmur command line, run on Electron's built-in Node.
ELECTRON_RUN_AS_NODE=1 exec "$ELECTRON" "$ROOT/bin/murmur.js" "\$@"
WRAP
  chmod +x "$HOME/.local/bin/murmur"

  mkdir -p "$DATA/applications" "$DATA/icons/hicolor/scalable/apps"
  cp "$ROOT/assets/icon.svg" "$DATA/icons/hicolor/scalable/apps/murmur.svg"
  cat > "$DATA/applications/murmur.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Murmur
Comment=Local Whisper dictation. Press a shortcut, talk, and the text appears.
Exec=$HOME/.local/bin/murmur open
Icon=murmur
Categories=Utility;Accessibility;
StartupWMClass=murmur
DESKTOP
  have update-desktop-database && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
fi

if have systemctl && systemctl --user show-environment >/dev/null 2>&1; then
  if [ "$DRY" = 0 ]; then
    mkdir -p "$CONF/systemd/user"
    cat > "$CONF/systemd/user/murmur.service" <<UNIT
[Unit]
Description=Murmur dictation
PartOf=graphical-session.target
After=graphical-session.target

[Service]
UnsetEnvironment=ELECTRON_RUN_AS_NODE
ExecStart=$ELECTRON $ROOT --hidden
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical-session.target
UNIT
    systemctl --user daemon-reload
    systemctl --user enable murmur.service >/dev/null 2>&1 || true
    systemctl --user restart murmur.service || true
  fi
  note "Murmur runs in the background now and starts with every login."
else
  # No systemd user session (Void, Artix, ...): XDG autostart instead.
  if [ "$DRY" = 0 ]; then
    mkdir -p "$CONF/autostart"
    cat > "$CONF/autostart/murmur.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Murmur
Exec=$ELECTRON $ROOT --hidden
X-GNOME-Autostart-enabled=true
DESKTOP
    (env -u ELECTRON_RUN_AS_NODE "$ELECTRON" "$ROOT" --hidden >/dev/null 2>&1 &)
  fi
  note "Murmur starts with every login (XDG autostart)."
fi

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) warn "$HOME/.local/bin is not in your PATH, so the \`murmur\` command only works with its full path." ;;
esac

bold "Done"
note "A setup window opens on the first start: pick a model and the shortcut."
note "Open it any time from your app menu (Murmur) or with: murmur open"
note "Something off? Run: murmur status"
