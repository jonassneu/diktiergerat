#!/usr/bin/env bash
# Builds whisper.cpp (whisper-server) with GPU support and installs it to
# ~/.local/share/murmur/bin. Vulkan is used by default; pass --cuda to use
# CUDA instead (needs the cuda package), or --cpu for a CPU-only build.
set -euo pipefail

BACKEND=vulkan
for arg in "$@"; do
  case "$arg" in
    --cuda) BACKEND=cuda ;;
    --cpu) BACKEND=cpu ;;
    --vulkan) BACKEND=vulkan ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/murmur"
WHISPER_REF="${WHISPER_REF:-master}"
mkdir -p "$VENDOR" "$DATA/bin"

if [ ! -d "$VENDOR/whisper.cpp" ]; then
  git clone --depth 1 --branch "$WHISPER_REF" https://github.com/ggml-org/whisper.cpp "$VENDOR/whisper.cpp"
fi

CMAKE_ARGS=(-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON -DWHISPER_SDL2=OFF)

case "$BACKEND" in
  vulkan)
    CMAKE_ARGS+=(-DGGML_VULKAN=ON)
    # Use system headers when present, otherwise fetch Vulkan-Headers locally.
    if [ ! -f /usr/include/vulkan/vulkan.h ]; then
      if [ ! -d "$VENDOR/Vulkan-Headers" ]; then
        git clone --depth 1 https://github.com/KhronosGroup/Vulkan-Headers "$VENDOR/Vulkan-Headers"
      fi
      CMAKE_ARGS+=(-DVulkan_INCLUDE_DIR="$VENDOR/Vulkan-Headers/include")
      export CPATH="$VENDOR/Vulkan-Headers/include${CPATH:+:$CPATH}"
    fi
    # ggml's shader build wants SPIRV-Headers as a CMake package.
    if ! pkg-config --exists SPIRV-Headers 2>/dev/null && [ ! -d /usr/share/cmake/SPIRV-Headers ]; then
      if [ ! -d "$VENDOR/spirv-prefix" ]; then
        rm -rf "$VENDOR/SPIRV-Headers"
        git clone --depth 1 https://github.com/KhronosGroup/SPIRV-Headers "$VENDOR/SPIRV-Headers"
        cmake -S "$VENDOR/SPIRV-Headers" -B "$VENDOR/SPIRV-Headers/build" -DCMAKE_INSTALL_PREFIX="$VENDOR/spirv-prefix" -DSPIRV_HEADERS_ENABLE_TESTS=OFF
        cmake --install "$VENDOR/SPIRV-Headers/build"
      fi
      CMAKE_ARGS+=(-DCMAKE_PREFIX_PATH="$VENDOR/spirv-prefix")
      export CPATH="$VENDOR/spirv-prefix/include:$CPATH"
    fi
    ;;
  cuda) CMAKE_ARGS+=(-DGGML_CUDA=ON) ;;
  cpu) ;;
esac

cmake -S "$VENDOR/whisper.cpp" -B "$VENDOR/build-$BACKEND" "${CMAKE_ARGS[@]}"
cmake --build "$VENDOR/build-$BACKEND" --config Release -j"$(nproc)" --target whisper-server whisper-cli

install -m755 "$VENDOR/build-$BACKEND/bin/whisper-server" "$DATA/bin/whisper-server"
install -m755 "$VENDOR/build-$BACKEND/bin/whisper-cli" "$DATA/bin/whisper-cli"
echo "$BACKEND" > "$DATA/bin/backend"
echo "Installed whisper-server ($BACKEND) to $DATA/bin"
