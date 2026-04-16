# Project Description

## Overview
Anime dubbing application built with OpenTUI for terminal-based user interfaces.

## Files and Responsibilities

### src/index.tsx
- Entry point of the application
- Renders a simple TUI with OpenTUI showing "OpenTUI" ascii art and "What will you build?" text
- Uses @robingenz/zli for command processing

### package.json
- Project configuration with bun as package manager
- Scripts: dev, start, start:headless, typecheck, lint

### src/utils/logger.ts
- Logger utility that writes to `logs/app.log` file
- Provides methods: info, warn, error, debug
- Auto-creates logs directory if not exists
- Formats messages with timestamp and log level
- Replaces console.log/console.error for cleaner TUI output
- Supports callback mechanism via `setLogCallback(cb)` to emit logs to UI
- When callback is registered, log entries are also emitted to the callback

### src/hooks/usePipelineLogger.ts
- React hook for storing log entries in memory
- Provides `addLog(level, message)` to add new log entries
- Provides `clearLogs()` to clear log buffer
- Provides `logs` ref for accessing log entries array
- Limits log buffer to 500 entries to prevent memory bloat
- Log entry structure: { timestamp: Date, level: "info"|"warn"|"error"|"debug", message: string }

### src/components/LogViewer.tsx
- React component for displaying scrollable logs
- Props: logs (LogEntry[]), maxHeight (number, default 12)
- Color-codes by level: info (default), warn (yellow #eab308), error (red #ef4444), debug (dim gray #6b7280)
- Shows timestamp in HH:MM:SS format
- Displayed below PipelineProgress in PipelineApp
- Supports keyboard scrolling: up/k to scroll up (older logs), down/j to scroll down (newer logs)
- Shows scroll indicator (↓/↕/↑) when logs exceed maxHeight
- Requires focusable parent for keyboard events to work

### src/types/pipeline.ts
- Type definitions for Pipeline, Step, and StepStatus
- Pipeline contains an array of Step objects, each with its own handler
- Step has name, description, and handler function
- Step handler signature: `({ input, context }) => Output` where:
  - `input` is the parsed pipeline input (z.infer<InputSchema>)
  - `context.signal` - AbortSignal for cancellation
  - `context.previousOutputs` - Record<number, unknown> - previous step outputs (step 2 can access step 1 via previousOutputs[0])
  - `context.args` - Record<string, unknown> - args passed from PipelineApp (includes outputFile, etc.)
- StepStatus: "pending" | "running" | "completed" | "error" | "cancelled"

### src/components/PipelineProgress.tsx
- React component for displaying pipeline progress
- Shows pipeline name, description, step list with status indicators, and progress bar
- Status indicators: pending (gray ○), running (yellow ◐), completed (green ✓), error (red ✗), cancelled (orange ○)

### src/pages/PipelineApp.tsx
- Generic UI page component for running any pipeline
- Props: pipeline (Pipeline), input (parsed input), outputFile (string), args (optional Record<string, unknown>), onCancel (optional callback), checkpoint (optional CheckpointData), tmpDirectory (optional string)
- Handles pipeline execution with useEffect and AbortController for cancellation
- Passes args to runPipeline including outputFile merged with custom args
- Displays PipelineProgress + LogViewer in ALL states: running, completed, cancelled, error
- Keyboard handler enables Ctrl+C cancellation (requires focusable container)
- Reusable across different pipeline types
- Integrates log viewer displaying logs from logger utility
- Registers log callback on mount to receive log entries
- If checkpoint provided, initializes step statuses from checkpoint and passes to runPipeline for resume
- Saves checkpoint after each step completes if tmpDirectory is provided

### src/utils/pipelineRunner.ts
- Utility for executing pipelines with progress callbacks
- Takes PipelineArgs: { input, args } where args includes outputFile and custom args
- Supports AbortSignal for cancellation
- Supports RunPipelineOptions: { tmpDirectory, checkpoint, onCheckpointSave } for checkpoint functionality
- Iterates through pipeline steps and passes to each handler: { input: parsedInput, context: { signal, previousOutputs, args } }
- previousOutputs is updated after each step completes so subsequent steps can access prior outputs
- Returns PipelineResult with output and cancelled flag
- When checkpoint provided: starts from checkpoint.currentStepIndex + 1, uses stored previousOutputs
- When tmpDirectory provided: saves checkpoint after each step completes via onCheckpointSave callback
- Clears checkpoint on successful completion

### src/utils/cliRenderer.ts
- Utility for rendering React elements to CLI
- Uses @opentui/core for createCliRenderer
- Uses @opentui/react for createRoot

### src/utils/logger.ts

### src/pipelines/audioExtraction.ts
- Pipeline definition for audio extraction
- Uses FFmpeg to convert video to audio format
- Contains 2 steps: "Extract Audio Stream" and "Convert to WAV"
- Each step has its own handler that receives StepContext (for cancellation via signal)
- Input: inputFile, outputFile
- Output: outputFile

### src/pipelines/dubbing.ts
- Pipeline for complete dubbing workflow (extract audio → transcribe → translate)
- Uses ReplicateUtil for AI processing (Whisper transcription, translation)
- Input: inputFile, outputFile, targetLanguage, tmpDirectory, sourceLanguage
- Steps:
  1. "Setup Environment" - Initialize pipeline environment
  2. "Convert to WAV" - Convert video audio to WAV format
  3. "Detect and Split by Silence" - Split audio at silence points
  4. "Seperate Speech from Audio" - Isolate speech from background (placeholder)
  5. "Transcribe Audio" - Convert speech to text using Whisper
  6. "Translate Transcript" - Translate text to target language using LLM
- Output: transcriptions array with text, timing, and reference audio paths

### src/pipelines/index.ts
- Exports all pipeline definitions

### src/types/checkpoint.ts
- Type definitions for checkpoint functionality
- CheckpointData interface: pipelineName, currentStepIndex, stepStatuses, stepNames, previousOutputs, input, timestamp, version
- CHECKPOINT_VERSION = 1
- CHECKPOINT_FILENAME = ".pipeline-checkpoint.json"

### src/utils/checkpoint.ts
- Checkpoint utilities: saveCheckpoint, loadCheckpoint, clearCheckpoint
- saveCheckpoint(tmpDir, data): saves checkpoint JSON to tmp directory
- loadCheckpoint(tmpDir, pipelineName, stepNames): loads checkpoint if exists, validates pipeline name and step count
  - Validates step names for completed steps (index < currentStepIndex)
  - If step name mismatch found at index i, adjusts checkpoint to resume from step i (preserves outputs from steps 0 to i-1)
  - Returns adjusted checkpoint instead of clearing when step names changed
- clearCheckpoint(tmpDir): removes checkpoint file after successful completion

### src/commands/dubbing.tsx
- Dubbing command entry point
- Defines CLI options (inputFile, tmpDirectory, outputFile)
- Imports pipeline and renders PipelineApp with renderToCli
- Checks for existing checkpoint on startup using loadCheckpoint
- Passes checkpoint and tmpDirectory to PipelineApp for resume functionality

### src/utils/audioSplit.ts
- Utility for splitting audio files by silence detection
- Uses FFmpeg's silencedetect filter to find silent portions
- Exports: `detectSilence(audioPath, silenceThreshold?, minSilenceDuration?)` - returns array of SilenceSegment objects with start, end, duration
- Exports: `splitAudioBySilence(options)` - splits audio into multiple files at silence points
  - Options: inputPath, outputDir, silenceThreshold (default -40dB), minSilenceDuration (default 0.5s), minSegmentDuration (default 0.3s)
  - Returns array of output file paths
- SilenceSegment interface: { start: number, end: number, duration: number }

### convert/ffmpeg.ts
- Handler for converting video files to WAV audio
- Uses fluent-ffmpeg library for audio conversion

### src/class/replicate.ts
- ReplicateUtil class for AI-powered audio processing
- Uses Replicate API for Whisper transcription and speech isolation
- Uses Hack Club AI (OpenRouter) for translation
- Methods:
  - `isolationSpeechFromAudio(audioUrl)` - Separate speech from background audio using SAM-audio-large model
  - `transcribeAudio(audioUrl, sourceLanguage)` - Transcribe audio using Incredibly Fast Whisper model, returns TranscriptionOutput[]
  - `translateTranscript(transcriptions, targetLanguage, sourceLanguage)` - Translate transcriptions using LLM, returns updated TranscriptionOutput[]

## Feature: Pipeline System with Steps, Cancellation, and Data Passing

### How it works
The dubbing command displays a real-time progress UI:
1. User runs `bun run src/index.tsx dubbing --inputFile <file> --outputFile <file>`
2. The PipelineApp component renders PipelineProgress during execution
3. Each step shows status: pending (○), running (◐), completed (✓), or error (✗)
4. Progress bar shows percentage completion
5. User can cancel by pressing Ctrl+C
6. On completion/cancellation/error, displays appropriate message

### Step Handler Context
Each step handler receives an object with:
```typescript
{
  input: { inputFile: string, outputFile: string }, // parsed input from schema
  context: {
    signal: AbortSignal, // for cancellation
    previousOutputs: Record<number, unknown>, // outputs from previous steps
    args: Record<string, unknown> // args passed from PipelineApp (outputFile, etc.)
  }
}
```

### Example: Step can access previous step output
```typescript
{
  name: "Step 2",
  handler: ({ context }) => {
    const step1Output = context.previousOutputs[0]; // access step 1 output
    const outputFile = context.args.outputFile; // access args
  }
}
```

### Implementation details
- Pipeline contains an array of Step objects, each with name, description, and handler
- Each step handler receives StepArgs: { input, context }
- context.signal for cancellation
- context.previousOutputs stores outputs from completed steps (index 0 = first step)
- context.args contains args passed from PipelineApp (outputFile, tmpDirectory, etc.)
- runPipeline accepts PipelineArgs: { input, args } and passes to each step

### Usage
```bash
# Run dubbing command with pipeline progress UI
bun run src/index.tsx dubbing --inputFile video.mp4 --outputFile audio.wav

# Press Ctrl+C to cancel during execution
```

### Pipeline Steps
1. "Extract Audio Stream" - Use FFmpeg to demux the video file and extract the audio stream
2. "Convert to WAV" - Convert the audio stream to WAV format for further processing

## Feature: Log Viewer

### How it works
1. PipelineApp registers a log callback with the logger on mount
2. When logger writes a log entry, it writes to file (existing behavior) AND calls the callback
3. usePipelineLogger hook stores entries in a ref
4. PipelineApp passes logs to LogViewer which displays them
5. LogViewer supports keyboard scrolling (up/down arrows or k/j keys)

### UI Layout
```
┌─────────────────────────────────────┐
│  Pipeline: Audio Extraction         │
│  [Step 1] ● Extract Audio Stream    │
│  [Step 2] ○ Convert to WAV          │
│  Progress: ████████░░ 80%           │
├─────────────────────────────────────┤
│  LOGS                         12 ↓  │
│  ─────────────────────────────     │
│  [18:00:01] Pipeline started...    │
│  [18:00:01] Extracting audio...    │
│  [18:00:02] Audio extracted        │
└─────────────────────────────────────┘
```

### Keyboard Controls
- **Up / k**: Scroll up to view older logs
- **Down / j**: Scroll down to view newer logs
- **Ctrl+C**: Cancel pipeline execution

### Notes
- Log buffer limited to 500 entries to prevent memory issues
- Debug logs are dimmed for visual distinction
- Scroll indicator shows position: ↓ (at bottom), ↕ (middle), ↑ (at top)
- LogViewer visible in all states (running/completed/cancelled/error) for review

## Feature: Pipeline Checkpoint/Resume

### Overview
Add automatic checkpoint saving to enable resuming pipeline execution from the last completed step. Checkpoints are saved in the user-provided tmp directory.

### How it works
```
User runs: bun run src/index.tsx dubbing --inputFile video.mp4 --tmpDirectory ./tmp

1. dubbing.tsx checks ./tmp for .pipeline-checkpoint.json
   - If found: load checkpoint, pass to PipelineApp
   - If not found: start fresh

2. runPipeline receives checkpoint data
   - If resuming: start from checkpoint.currentStepIndex + 1
   - Use checkpoint.previousOutputs for steps that were completed

3. After each step completes:
   - runPipeline saves checkpoint with updated state

4. On successful completion:
   - Clear checkpoint file
```

### Checkpoint Data
- pipelineName: string (to verify pipeline matches)
- currentStepIndex: number (index of last completed step)
- stepStatuses: StepStatus[] (status of each step)
- stepNames: string[] (step names for validation)
- previousOutputs: Record<number, unknown> (serializable outputs from completed steps)
- input: unknown (original pipeline input)
- timestamp: string (ISO date)
- version: number (for future compatibility)

### Edge Cases
- **Corrupted checkpoint**: If JSON parse fails, treat as no checkpoint, start fresh
- **Different pipeline**: If checkpoint pipeline name differs, ignore and start fresh
- **Step count mismatch**: If step count differs, clear checkpoint and restart
- **Step name mismatch**: If a completed step's name changed, adjust checkpoint to resume from that step (preserving outputs from earlier steps)
- Only serializable data is stored (strings, numbers, arrays). Skip non-serializable like file buffers.

## Future Improvements
- Add more pipeline types (video processing, subtitle extraction)
- Add unit tests with OpenTUI's test renderer
- Add more CLI flags for configuration
- Support multiple pipelines with selection
- Add "Clear logs" and "Auto-scroll" toggle
- Add log filtering by level

## Migration Notes
- Console logs migrated to use logger utility in `src/utils/logger.ts`
- Log files written to `logs/app.log` to keep TUI output clean
- FFmpeg progress and error logs now use logger instead of console.log
- Help command now uses logger for output
- Added log viewer feature to display logs in PipelineApp UI (2026-04-15)
- Fixed keyboard scrolling in LogViewer (up/k to scroll up, down/j to scroll down) (2026-04-15)
- Fixed Ctrl+C cancellation not stopping pipeline - now properly aborts (2026-04-15)
- LogViewer now visible in all states (completed/cancelled/error) for log review (2026-04-15)
- Added pipeline checkpoint/resume feature - pipeline can resume from last completed step (2026-04-16)
- Added step name validation in checkpoint - changing step name adjusts checkpoint to re-run from that step while preserving earlier outputs (2026-04-16)
