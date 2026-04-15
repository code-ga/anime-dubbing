# Anime Dubbing TUI

A terminal-based user interface application for anime dubbing pipelines, built with [OpenTUI](https://github.com/opentui/opentui).

## Features

- **Pipeline System**: Execute multi-step processing pipelines with real-time progress tracking
- **Terminal UI**: Beautiful CLI interface using OpenTUI
- **Log Viewer**: Real-time log display with keyboard scrolling support
- **Cancellation**: Press Ctrl+C to cancel pipeline execution at any time
- **FFmpeg Integration**: Built-in audio extraction and conversion using FFmpeg

## Installation

```bash
bun install
```

## Usage

### Run the dubbing command

```bash
bun run src/index.tsx dubbing --inputFile <video_file> --outputFile <output_file>
```

### Available Commands

- `dubbing` - Extract audio from video files
- `help` - Show help information

### Keyboard Controls

- **Ctrl+C** - Cancel pipeline execution
- **Up / k** - Scroll up in log viewer (view older logs)
- **Down / j** - Scroll down in log viewer (view newer logs)

## Project Structure

```
anime-dubbing/
├── src/
│   ├── components/
│   │   ├── LogViewer.tsx      # Log display component with scrolling
│   │   └── PipelineProgress.tsx # Pipeline step progress display
│   ├── commands/
│   │   ├── dubbing.tsx        # Dubbing command entry point
│   │   ├── help.tsx          # Help command
│   │   └── index.ts          # Command exports
│   ├── hooks/
│   │   └── usePipelineLogger.ts # React hook for log storage
│   ├── pages/
│   │   └── PipelineApp.tsx   # Main pipeline execution page
│   ├── pipelines/
│   │   ├── audioExtraction.ts # Audio extraction pipeline definition
│   │   └── index.ts          # Pipeline exports
│   ├── types/
│   │   └── pipeline.ts       # Pipeline type definitions
│   ├── utils/
│   │   ├── cliRenderer.ts    # CLI rendering utilities
│   │   ├── logger.ts         # Logging utility
│   │   └── pipelineRunner.ts # Pipeline execution engine
│   └── index.tsx             # Application entry point
├── convert/
│   └── ffmpeg.ts             # FFmpeg conversion handler
├── package.json
├── tsconfig.json
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