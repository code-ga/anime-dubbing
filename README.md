# Anime Dubbing TUI

A terminal-based user interface application for anime dubbing pipelines, built with [OpenTUI](https://github.com/opentui/opentui).

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

```bash
bun install
```

## Usage

### Run the dubbing command

```bash
bun run src/index.tsx dubbing --inputFile <video_file> --outputFile <output_file>
```

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

- [Bun](https://bun.sh/) - JavaScript runtime and package manager
- [FFmpeg](https://ffmpeg.org/) - Media file converter (included via ffmpeg-static)

## Development

```bash
# Run in development mode with watch
bun run dev

# Run in production
bun run start

# Type check
bun run typecheck

# Lint
bun run lint
```

## License

MIT