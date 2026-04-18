# Build Guide

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+) - Runtime and build tool

## Build Commands

### Development Build (watch mode)

```bash
bun run dev
```

### Production Build

```bash
bun build src/index.tsx --outfile anime-dubbing.exe --compile
```

This creates a standalone executable `anime-dubbing.exe` that can run without Bun installed.

### Build Options

| Flag | Description |
|------|-------------|
| `--outfile` | Output executable name |
| `--compile` | Create standalone executable |
| `--minify` | Minify the output |
| `--target` | Target platform (default: bun-linux-x64, bun-macos-x64, bun-windows-x64) |

### Example - Windows x64

```bash
bun build src/index.tsx --outfile anime-dubbing.exe --compile --target bun-windows-x64
```

### Example - Cross-compile for Linux

```bash
bun build src/index.tsx --outfile anime-dubbing --compile --target bun-linux-x64
```

## Bundle Size Optimization

The project already excludes development dependencies. The final exe size will include:
- Bun runtime (~60MB)
- FFmpeg static (~40MB)
- Your application code

## Running the Executable

```bash
# Windows
./anime-dubbing.exe dubbing --inputFile video.mp4 --outputFile output.mp4

# Linux/macOS
./anime-dubbing dubbing --inputFile video.mp4 --outputFile output.mp4
```

## Troubleshooting

### FFmpeg not found in packaged app

The `ffmpeg-static` package should bundle FFmpeg automatically. If issues occur, ensure the binary is included in your distribution.

### Missing native modules

Some dependencies may require rebuilding for the target platform. Use `bun pm cache -g` to ensure global cache is available.