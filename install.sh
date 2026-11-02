#!/usr/bin/env bash
# One-line install of Murmur:
#   curl -fsSL https://raw.githubusercontent.com/jonassneu/diktiergerat/main/install.sh | bash
# Downloads (or updates) Murmur into ~/.local/share/murmur/app and runs
# scripts/install.sh from there. Options are passed on, e.g. `| bash -s -- --cpu`.
set -euo pipefail

REPO="${MURMUR_REPO:-https://github.com/jonassneu/diktiergerat.git}"
DIR="${MURMUR_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/murmur/app}"

# Run from a checkout: no download needed.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/scripts/install.sh" ] && [ -f "$HERE/package.json" ]; then
  exec bash "$HERE/scripts/install.sh" "$@"
fi

if ! command -v git >/dev/null 2>&1; then
  echo "==> Installing git first"
  if command -v dnf >/dev/null; then sudo dnf install -y git
  elif command -v apt-get >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y git
  elif command -v pacman >/dev/null; then sudo pacman -S --needed --noconfirm git
  elif command -v zypper >/dev/null; then sudo zypper --non-interactive install git
  else echo "Please install git and run this again." >&2; exit 1
  fi
fi

if [ -d "$DIR/.git" ]; then
  echo "==> Updating Murmur in $DIR"
  git -C "$DIR" pull --ff-only
else
  echo "==> Downloading Murmur to $DIR"
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 "$REPO" "$DIR"
fi

# stdin may be the curl pipe; give the installer the terminal for sudo.
if [ -r /dev/tty ]; then
  exec bash "$DIR/scripts/install.sh" "$@" </dev/tty
fi
exec bash "$DIR/scripts/install.sh" "$@"
