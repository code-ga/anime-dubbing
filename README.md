# Anime Dubbing TUI

A terminal-based user interface application for anime dubbing pipelines, built with [OpenTUI](https://github.com/opentui/opentui).

# Important limitation
- Currently, the tts model isn't working well with music. i think that you should using this tool with podcast or speech only video for archive the best result.
- Also i recommend you using minimax tts (currently is default config) for the predictable result because qwen-tts sometime crashing and output unpredictable audio quality
- Sometimes the errors might cause by your api balance so i recommend you using small video to test (to know how much you should spend for that length of video) before using on long video (about 2$/minute)
## Features

- **Pipeline System**: Execute 10-step dubbing pipelines with real-time progress tracking
- **Terminal UI**: Beautiful CLI interface using OpenTUI
- **Log Viewer**: Real-time log display with keyboard scrolling support (up/k, down/j)
- **Cancellation**: Press Ctrl+C to cancel pipeline execution at any time
- **Checkpoint/Resume**: Automatically saves progress; resumes from last completed step on re-run
- **SRT Export**: Save subtitles with `--subtitleDirectory` or `-S` flag
- **Background Audio Preservation**: Mixes TTS with original audio at 25% volume
- **FFmpeg Integration**: Built-in audio/video processing using fluent-ffmpeg

## Installation

### Prerequisites

- [Bun](https://bun.sh/) (v1.0+) - JavaScript runtime and package manager
- [FFmpeg](https://ffmpeg.org/) - Media file converter (bundled automatically via ffmpeg-static)

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment Variables

**Security Note:** The `.env` file is ignored by git (see `.gitignore`) to prevent accidentally committing secrets. Never commit your actual API keys.

1. Copy the template: `cp .env.example .env`
2. Edit `.env` and add your `REPLICATE_API_TOKEN` and `HACK_CLUB_AI_API_KEY`.
   - `REPLICATE_API_TOKEN` from [replicate.com](https://replicate.com/) (or use [HackClub Ai proxy](https://docs.ai.hackclub.com/guide/replicate.html) (extreme recommendation solution))
   - `HACK_CLUB_AI_API_KEY` from [ai.hackclub.com](https://ai.hackclub.com/)
3. Keep the file private - never commit `.env` to version control.

The other variables are optional and have sensible defaults.

**Environment Variables:**

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `REPLICATE_API_TOKEN` | Yes | API token for Replicate (transcription & TTS) | - |
| `HACK_CLUB_AI_API_KEY` | Yes | API key for OpenRouter/HackClub AI (translation) | - |
| `REPLICATE_BASE_URL` | No | Custom Replicate API endpoint | `https://ai.hackclub.com/proxy/v1/replicate` |
| `HACK_CLUB_AI_BASE_URL` | No | Custom OpenRouter-compatible endpoint | `https://ai.hackclub.com/proxy/v1` |
| `HF_TOKEN` | No | HuggingFace token for speaker diarization (feature disabled by default) | - |

## Usage

### Run the dubbing command

**Development mode (with Bun):**
```bash
bun run src/index.tsx dubbing --inputFile <video_file> --outputFile <output_file>
```

**Production (after building):**
```bash
# Windows
.\anime-dubbing.exe dubbing -i <video_file> -o <output_file>

# Linux/macOS
./anime-dubbing dubbing -i <video_file> -o <output_file>
```

**Example (with all options):**
```bash
.\anime-dubbing.exe dubbing ^
  -i .\sample\test.mp4 ^
  -t .\tmp\pipeline\tmp\ ^
  -o .\tmp\pipeline\output\out.mp4 ^
  -s ja ^
  -l en ^
  -S .\tmp\pipeline\output\subtitle ^
  --tts-mode "minimax"
```

*(Use `\` for line continuation on Windows or `\` on Unix-like systems)*

### Dubbing Options

| Option | Description | Default |
|--------|-------------|---------|
| `--inputFile, -i` | Input video file (required) | - |
| `--outputFile, -o` | Output video file | `output.mp4` |
| `--tmpDirectory, -t` | Temp directory for processing | `./tmp` |
| `--targetLanguage, -l` | Target language for dubbing | `en` |
| `--sourceLanguage, -s` | Source language (auto-detect if not set) | `auto` |
| `--subtitleDirectory, -S` | Directory to save SRT subtitles | (optional) |

### Available Commands

- `dubbing` - Dub video with AI-generated voice
- `help` - Show help information

### Keyboard Controls

- **Ctrl+C** - Cancel pipeline execution
- **Up / k** - Scroll up in log viewer (older logs)
- **Down / j** - Scroll down in log viewer (newer logs)

## Project Structure

```
anime-dubbing/
├── src/
│   ├── class/
│   │   └── replicate.ts      # ReplicateUtil for AI processing
│   ├── commands/
│   │   ├── dubbing.tsx     # Dubbing command entry point
│   │   ├── help.tsx        # Help command
│   │   └── index.ts       # Command exports
│   ├── components/
│   │   ├── LogViewer.tsx   # Log display with scrolling
│   │   └── PipelineProgress.tsx # Step progress display
│   ├── convert/
│   │   └── ffmpeg.ts      # FFmpeg processing utilities
│   ├── hooks/
│   │   └── usePipelineLogger.ts # Log storage hook
│   ├── pages/
│   │   └── PipelineApp.tsx # Main pipeline execution page
│   ├── pipelines/
│   │   ├── dubbing.ts     # 10-step dubbing pipeline
│   │   └── index.ts       # Pipeline exports
│   ├── types/
│   │   ├── checkpoint.ts # Checkpoint type definitions
│   │   └── pipeline.ts    # Pipeline type definitions
│   ├── utils/
│   │   ├── audioSplit.ts  # Silence detection/splitting
│   │   ├── checkpoint.ts # Checkpoint save/load
│   │   ├── cliRenderer.ts # CLI rendering utilities
│   │   ├── logger.ts     # Logging utility
│   │   ├── pipelineRunner.ts # Pipeline execution
│   │   └── voice.ts      # Voice processing utilities
│   └── index.tsx           # Application entry point
├── package.json
└── README.md
```

## Requirements

### Software
- [Bun](https://bun.sh/) (v1.0+) - JavaScript runtime and package manager
- [FFmpeg](https://ffmpeg.org/) - Media processing (bundled via `ffmpeg-static`)

### API Credentials

Two API tokens are required:

- `REPLICATE_API_TOKEN` from [replicate.com](https://replicate.com/) for transcription and TTS services.
- `HACK_CLUB_AI_API_KEY` from [ai.hackclub.com](https://ai.hackclub.com/) for translation via OpenRouter.

The application uses HackClub's proxy to access these models.

### Environment Variables

See the [Installation](#installation) section for the full list of configurable environment variables.

## Development

```bash
# Run in development mode with watch
bun run dev

# Run in production (direct execution)
bun run start

# Type check
bun run typecheck

# Lint code
bun run lint
```

For building distributable executables, see **[Build & Distribution](#build--distribution)**.

## Build & Distribution

### Create Standalone Executable

Build a single executable that bundles Bun runtime and all dependencies:

```bash
# Windows (default target)
bun build src/index.tsx --outfile anime-dubbing.exe --compile

# Linux
bun build src/index.tsx --outfile anime-dubbing --compile --target bun-linux-x64

# macOS (Intel)
bun build src/index.tsx --outfile anime-dubbing --compile --target bun-macos-x64

# macOS (Apple Silicon)
bun build src/index.tsx --outfile anime-dubbing --compile --target bun-macos-arm64

# Cross-compile for multiple platforms (requires Docker)
bun build src/index.tsx --outfile anime-dubbing --compile --target bun-linux-x64
```

**Build Options:**

| Flag | Description |
|------|-------------|
| `--outfile` | Output executable name |
| `--compile` | Create standalone executable (bundles Bun runtime) |
| `--minify` | Minify output to reduce size |
| `--target` | Target platform (bun-windows-x64, bun-linux-x64, bun-macos-x64, bun-macos-arm64) |

### Bundle Size

The standalone executable includes:
- Bun runtime (~60 MB)
- FFmpeg static binary (~40 MB)
- All JavaScript dependencies

Total size: ~100-120 MB (before minification). Use `--minify` to reduce size by ~30%.

### Distribution

After building, distribute the executable along with:
- The `.env.example` template (users must create their own `.env` with `REPLICATE_API_TOKEN` and `HACK_CLUB_AI_API_KEY`)
- Any required runtime libraries (none for standalone builds)

**Example distribution structure:**
```
anime-dubbing/
├── anime-dubbing.exe      # Built executable (Windows)
├── .env.example           # Environment template
├── README.md              # This file
└── LICENSE
```

**Running the packaged app:**
```bash
# Windows
.\anime-dubbing.exe dubbing --inputFile video.mp4 --outputFile output.mp4

# Linux/macOS
./anime-dubbing dubbing --inputFile video.mp4 --outputFile output.mp4
```

### Troubleshooting Build Issues

**FFmpeg binary not found:**
The `ffmpeg-static` package bundles FFmpeg automatically. If missing, reinstall:
```bash
bun install ffmpeg-static --save
```

**Cross-compilation fails:**
Some native modules may need rebuilding for the target platform. Clean and rebuild:
```bash
bun pm cache -g
bun build src/index.tsx --outfile anime-dubbing --compile --target <platform>
```

## License

MIT