<img src="assets/icon.svg" width="64" height="64" alt="">

# Murmur (Diktiergerät)

Local Whisper dictation for Hyprland. Hold a shortcut, talk, let go, and the
text is typed wherever your cursor is. Whisper runs on your own GPU through
whisper.cpp, so audio never leaves the PC and is never saved.

## Install

```sh
./scripts/install.sh               # Vulkan build (default)
./scripts/install.sh --cuda        # or CUDA, needs the cuda package
systemctl --user enable --now murmur.service
```

The first launch opens a short setup that picks a model, adds the
shortcut to Hyprland and lets you try it out. Models already downloaded by
Handy are reused instead of downloaded again.

## Use

| | |
|---|---|
| `Super Ctrl Space` (hold) | listen, release to type |
| `murmur open [transcripts\|shortcut\|models\|setup]` | open the window |
| `murmur status` | model, backend, shortcut, input |
| `murmur start` / `stop` / `toggle` / `cancel` | what the Hyprland binds call |

If no text field has focus, the text goes to the clipboard instead.
Transcripts are kept as text for 30 days in `~/.local/share/murmur/history.json`.

## Hyprland

"Add to Hyprland" appends one marked block to `config/binds.lua` (or
`hyprland.conf`) containing the shortcut binds and the window rules that keep
the overlay floating, pinned and unfocusable. "Remove" deletes exactly that
block. Nothing else in your config is touched, and Murmur never changes the
running compositor directly.

## Layout

- `src/main` Electron main process: recorder (`pw-record`), whisper-server
  manager, typing (`wtype`, `wl-copy`), Hyprland integration, CLI socket
- `src/renderer` overlay, setup and settings UI (Preact + htm, no build step)
- `src/shared/binds.js` shortcut checks and bind snippets, used by both sides
- `bin/murmur.js` command line
- `scripts/` whisper.cpp build and install

`npm test` runs the unit tests.
