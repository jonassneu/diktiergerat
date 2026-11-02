<img src="assets/icon.svg" width="64" height="64" alt="">

# Murmur (Diktiergerät)

Local Whisper dictation for Linux. Press a shortcut, talk, and the text
appears wherever your cursor is. Whisper runs on your own GPU (or CPU)
through whisper.cpp, so audio never leaves the PC and is never saved.

## Install

One line, on any common distribution:

```sh
curl -fsSL https://raw.githubusercontent.com/jonassneu/diktiergerat/main/install.sh | bash
```

Or from a checkout: `./install.sh`. Options: `--cuda`, `--vulkan`, `--cpu`
(force the whisper backend), `--no-deps`, `--rebuild`, `--dry-run`.

The installer asks for sudo once to install packages, builds whisper.cpp for
your graphics card (CUDA on NVIDIA with the CUDA toolkit, otherwise Vulkan,
falling back to the CPU), downloads Node 22 into Murmur's folder only if your
system Node is too old, and starts Murmur as a background service. The first
launch opens a short setup that picks a model and the shortcut.

Supported distributions: Fedora, Nobara, Ubuntu, Debian, Mint, Pop!_OS, Arch,
CachyOS, Manjaro, EndeavourOS, openSUSE (dnf, apt, pacman, zypper).

## Desktops

| Desktop | Shortcut | Typing |
|---|---|---|
| Hyprland | added to your Hyprland config, hold or tap | `wtype` |
| KDE Plasma, GNOME 48+, COSMIC (Wayland) | XDG shortcut portal, the desktop asks once to confirm; hold or tap | `ydotool` |
| older GNOME (Wayland) | added to GNOME keyboard shortcuts, tap | `ydotool` |
| Sway, niri, river, labwc, Wayfire | bind `murmur toggle` yourself | `wtype` |
| any X11 desktop (Xfce, Cinnamon, MATE, ...) | registered by Murmur, tap | `xdotool` |

Text is pasted in one go (Ctrl+V, Ctrl+Shift+V in terminals) and your
clipboard is put back afterwards. On GNOME/KDE Wayland the installer sets up
`ydotool` with a user service and lets only the logged-in user use
`/dev/uinput` (udev `uaccess`, no group changes). If Murmur cannot type, the
text goes to the clipboard and the overlay says why.

## Use

| | |
|---|---|
| `Super Ctrl Space` | talk; release (hold mode) or tap again to type |
| `murmur open [transcripts\|shortcut\|models\|setup]` | open the window |
| `murmur status` | model, backend, desktop, typing tool, shortcut, input |
| `murmur start` / `stop` / `toggle` / `cancel` | for your own key binds |

Transcripts are kept as text for 30 days in `~/.local/share/murmur/history.json`.

## Hyprland

"Add to Hyprland" appends one marked block to `config/binds.lua` (or
`hyprland.conf`) containing the shortcut binds and the window rules that keep
the overlay floating, pinned and unfocusable. "Remove" deletes exactly that
block. Nothing else in your config is touched.

## Layout

- `src/main` Electron main process: recorder (`pw-record`, `parecord` or
  `arecord`), whisper-server manager, desktop detection (`desktop.js`),
  typing (`keys.js`, `output.js`), shortcuts (`shortcut.js`, `portal.js`),
  Hyprland integration, CLI socket
- `src/renderer` overlay, setup and settings UI (Preact + htm, no build step)
- `src/shared/binds.js` shortcut checks and bind snippets, used by both sides
- `bin/murmur.js` command line
- `install.sh` one-line installer, `scripts/` whisper.cpp build and install

`npm test` runs the unit tests.

## License

MIT, see [LICENSE](LICENSE). The bundled Inter and JetBrains Mono fonts are
under the SIL Open Font License, see `src/renderer/assets/fonts/LICENSE-OFL.txt`.
