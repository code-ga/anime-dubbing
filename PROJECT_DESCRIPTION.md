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
- Props: pipeline (Pipeline), input (parsed input), outputFile (string), args (optional `Record<string, unknown>`), onCancel (optional callback), checkpoint (optional CheckpointData), tmpDirectory (optional string)
- Handles pipeline execution with useEffect and AbortController for cancellation
- Constructs pipelineArgs: merges outputFile, input fields, and custom args; ensures `replicateUtil` is available by using passed args or creating new ReplicateUtil instance
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

### src/pipelines/index.ts
- Exports all pipeline definitions

### Pipeline Steps (Dubbing)
1. "Setup Environment" - Initialize pipeline environment
2. "Convert to WAV" - Convert video audio to WAV format using FFmpeg
3. "Detect and Split by Silence" - Split audio at silence points using FFmpeg silencedetect
4. "Seperate Speech from Audio" - Placeholder (pass-through); originally intended for speech isolation using SAM-audio-large
5. "Transcribe Audio" - Convert speech to text using Whisper via Replicate; outputs transcriptions with timing (start/end) and reference audio segment paths
6. "Translate Transcript" - Translate text to target language using LLM (OpenRouter/Hack Club AI); outputs translated transcriptions with original text preserved
7. "Save Subtitles to SRT" - If `subtitleDirectory` provided, saves original.srt and translated.srt; otherwise skips
8. "Generate Dubbed Audio" - Generate TTS audio for each translated segment using ReplicateUtil.generateVoice(); supports user-selected TTS provider (`auto`, `qwen`, or `minimax`) and `voiceClone` toggle; outputs `{ path, startTime, originalDuration }` for each segment
9. "Merge Segments to Single Audio" - Mix TTS segments with original background audio using `mixTtsWithOriginalAudioBatched()`: background volume reduced to 25%, TTS positioned at original timestamps with 5ms fade in/out, speed-adjusted to match segment durations via atempo, all streams converted to stereo for amix compatibility, combines using amix filter; for large numbers of segments (>31), processes in batches to avoid FFmpeg input limits; cleans up temp files; output: `tmpDirectory/dubbed_full.mp3`
10. "Merge Audio with Video" - Combine dubbed audio with original video using `mergeAudioWithVideo()`; copies video stream (`-c:v copy`), maps audio from second input (`-map 1:a:0`), uses `-shortest`; final output: `input.outputFile` (e.g., output.mp4)
- Output: `outputFile` (path to final dubbed video)
- Checkpoint-aware: Adding steps changes step count; existing checkpoints reset from step 0 (handled by `loadCheckpoint` step name validation)

### Known Limitations & Future Work (Dubbing)
1. **Timing alignment (partially solved)**: `mixTtsWithOriginalAudio()` adjusts each TTS segment's speed to match original duration using FFmpeg atempo filter, and positions them at original timestamps with background audio ducked to 25% volume. Limitations:
   - Speed factor clamped to [0.5, 2.0]; if TTS is >2x or <0.5x original duration, audio will still drift (would need chained atempo or more aggressive strategies)
   - Quality degradation from time-stretching may occur especially at extreme speed factors
   - Rounding errors in delay positioning and speed adjustment may cause slight sync drift over long segments
2. **Speaker diarization**: Current transcription doesn't distinguish multiple speakers; entire video uses single voice clone. Future: enable diarization (Whisper `diarize_audio` + HF token), group segments by speaker, optionally assign different voices.
3. **Output format options**: Currently hardcoded to MP4 video with replaced audio. Future: allow audio-only output (MP3/WAV), separate audio+video files, or subtitle track generation.
4. **Voice selection**: TTS automatically chooses Qwen (voice cloning) or MiniMax (preset) based on language. Future: CLI flag to force specific TTS provider, voice presets, or custom voice cloning parameters.
5. **Speech separation placeholder**: Step 4 "Seperate Speech from Audio" is currently a passthrough; if enabled later, will need index adjustment in subsequent steps (currently step 5 accesses `previousOutputs[3]`, which would become the separated output).
6. **Audio-video sync edge cases**: `mergeAudioWithVideo()` uses `-shortest`; if dubbed audio still shorter than video (due to clamped speed adjustment), video cuts early; if longer (unlikely after timing alignment), audio gets truncated. Future: add offset parameter, or analyze/adjust final audio duration before merge.

### src/types/language.ts
- Single source of truth for language metadata
- Defines `LanguageCode` enum and `LanguageInfo` interface
- `LANGUAGE_MAP` contains comprehensive data including native names, translation names, and TTS model support
- Derives `SUPPORTED_LANGUAGES`, `QWEN_TTS_SUPPORTED_LANGUAGES`, and `MINIMAX_TTS_SUPPORTED_LANGUAGES` from the map

### src/utils/language.ts
- Centralized language utilities using metadata from `src/types/language.ts`
- `normalizeLanguageName(input)`: Normalizes language codes/names to standard translation names
- `getTTSProvider(language, preference?)`: Determines the appropriate TTS model (qwen/minimax) based on support and user preference
- `getLanguageNameForTranslation(language)`: Returns the name to use in LLM prompts

### src/types/checkpoint.ts
- Type definitions for checkpoint functionality
- CheckpointData interface: pipelineName, currentStepIndex, stepStatuses, stepNames, stepVersions, previousOutputs, input, timestamp, version
- CHECKPOINT_VERSION = 1
- CHECKPOINT_FILENAME = ".pipeline-checkpoint.json"

### src/utils/checkpoint.ts
- Checkpoint utilities: saveCheckpoint, loadCheckpoint, clearCheckpoint
- saveCheckpoint(tmpDir, data): saves checkpoint JSON to tmp directory
- loadCheckpoint(tmpDir, pipelineName, stepNames, stepVersions?): loads checkpoint if exists, validates pipeline name and step count
  - Validates step versions for completed steps (index < currentStepIndex) - if version mismatch, adjusts to resume from that step
  - Also validates step names for completed steps (for backward compatibility)
  - Returns adjusted checkpoint instead of clearing when step changed
- clearCheckpoint(tmpDir): removes checkpoint file after successful completion

### src/utils/audioSplit.ts
- Utility for splitting audio files by silence detection
- Uses FFmpeg's silencedetect filter to find silent portions
- Exports: `detectSilence(audioPath, silenceThreshold?, minSilenceDuration?)` - returns array of SilenceSegment objects with start, end, duration
- Exports: `splitAudioBySilence(options)` - splits audio into multiple files at silence points
  - Options: inputPath, outputDir, silenceThreshold (default -40dB), minSilenceDuration (default 0.5s), minSegmentDuration (default 0.3s)
  - Returns array of output file paths
- SilenceSegment interface: { start: number, end: number, duration: number }
- TranscriptionWithRef interface extends TranscriptionOutput with:
  - ref_audio: string (original audio path)
  - audio_file: string (split audio segment path)
  - originalText?: string (original text before translation, set in Translate Transcript step)

### convert/ffmpeg.ts
- FFmpeg utility functions for audio/video processing using fluent-ffmpeg
- Functions:
  - `convertToWav(inputPath, outputPath)` - Convert video audio to WAV (actually outputs MP3 via .toFormat("mp3"))
  - `getAudioDuration(filePath)` - Probe audio file to get duration in seconds using ffprobe
  - `mergeAudioSegments(audioFiles, outputPath)` - Simple concatenation without timing; takes `AudioSegmentInput[]` (path, startTime), sorts by startTime, writes concat list, uses `-c copy` for lossless merge
  - `adjustAudioSpeed(audioPath, outputPath, speedFactor)` - Time-stretch audio using FFmpeg atempo filter; clamps factor to [0.5, 2.0]; outputs adjusted file
  - `createSilenceFile(outputPath, durationSeconds)` - Generate silent audio (stereo, 44.1kHz) of specified duration using anullsrc lavfi source
  - `mergeAudioSegmentsWithTiming(audioFiles, outputPath, tmpDir)` - Advanced merge with timing alignment: speeds up/slows down each segment to match original duration (using `originalDuration` property), inserts silence gaps between segments based on original `startTime` offsets; cleans up temp adjusted/silence files after merge
  - `mergeAudioWithVideo(videoPath, audioPath, outputPath)` - Merge dubbed audio with original video; copies video stream (`-c:v copy`), maps audio from second input (`-map 1:a:0`), uses `-shortest` to end at shorter of video/audio durations
  - `mixTtsWithOriginalAudioBatched(ttsSegments, originalAudioPath, outputPath, tmpDir)` - Batched version of mixTtsWithOriginalAudio for handling large numbers of segments; processes in batches of 31 (to stay under amix filter limit of 64), mixes each batch with original audio, then concatenates batch results; handles 67+ segments without hitting FFmpeg input limits
  - `processAndMergeDubbedAudio(ttsSegments, originalAudioPath, outputPath, tmpDir, bgVolume, ttsVolume)` - Precise audio merging using ffmpeg concat demuxer. Handles speed adjustment, 5ms crossfades, and gap padding with silence.
- Interfaces:
  - `AudioSegmentInput`: `{ path: string; startTime: number }`
  - Extended segment for timing: `{ path: string; startTime: number; originalDuration?: number }`

### src/class/replicate.ts
- ReplicateUtil class for AI-powered audio and text processing
- Uses centralized language utilities for translation and TTS
- Methods:
  - `isolationSpeechFromAudio(audioUrl)` - Separate speech from background using SAM-audio-large (placeholder)
  - `transcribeAudio(audioUrl, sourceLanguage)` - Transcribe audio using Incredibly Fast Whisper; returns TranscriptionOutput[]
  - `translateTranscript(transcriptions, targetLanguage, sourceLanguage)` - Translate transcriptions using AI; preserves original if translation missing
  - `generateVoice({ text, ref_audioUrl, textInOrginalLanguage, language, ttsProvider, voiceClone })` - Generate TTS audio; supports explicit `ttsProvider` selection (`auto`, `qwen`, `minimax`) and `voiceClone` toggle
- Supports both HTTP URLs and local file paths for audio input

### src/commands/dubbing.tsx
- Dubbing command entry point
- Defines CLI options: 
  - `inputFile` (required, `-i`)
  - `tmpDirectory` (default: `./tmp`, `-t`)
  - `outputFile` (default: `output.mp4`, `-o`)
  - `targetLanguage` (default: `en`, `-l`, validated against `SUPPORTED_LANGUAGES`)
  - `sourceLanguage` (default: `None`, `-s`)
  - `subtitleDirectory` (optional, `-S`)
  - `backgroundVolume` (default: 0.25, `-b`)
  - `dubbedVolume` (default: 1.0, `-v`)
  - `ttsMode` (default: `auto`, `-m`, choices: `auto`, `qwen`, `minimax`)
  - `voiceClone` (default: `true`, `-c`, boolean)
- Creates ReplicateUtil instance and passes via args prop to PipelineApp
- Loads checkpoint from tmpDirectory and passes to PipelineApp for resume support
- Renders PipelineApp with renderToCli for TUI display
- Output is final dubbed video file (MP4 format)

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
  input: { 
    inputFile: string, 
    outputFile: string, 
    targetLanguage: string, 
    tmpDirectory: string, 
    sourceLanguage: string,
    ttsMode: "auto" | "qwen" | "minimax",
    voiceClone: boolean
  }, // parsed input from schema
  context: {
    signal: AbortSignal, // for cancellation
    previousOutputs: Record<number, unknown>, // outputs from previous steps (index 0 = step 1, index N = step N+1)
    args: Record<string, unknown> // args passed from PipelineApp (includes outputFile, tmpDirectory, replicateUtil, etc.)
  }
}
```
**Indexing note:** Steps access prior outputs via 0-based indices. For the dubbing pipeline:
- Step 6 (Translate) reads `previousOutputs[4]` (Transcribe Audio output)
- Step 7 (Save Subtitles) reads `previousOutputs[5]` (Translate Transcript output)
- Step 8 (Generate Dubbed Audio) reads `previousOutputs[5]` (Translate Transcript output)
- Step 9 (Merge Segments) reads `previousOutputs[7]` (Generate Dubbed Audio output) and `previousOutputs[1]` (original audio from Step 2)
- Step 10 (Merge with Video) reads `previousOutputs[8]` (Merge Segments output)

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

### Pipeline Steps (Dubbing)
1. "Setup Environment" - Initialize pipeline environment
2. "Convert to WAV" - Convert video audio to WAV format using FFmpeg
3. "Detect and Split by Silence" - Split audio at silence points
4. "Seperate Speech from Audio" - Placeholder (pass-through); originally intended for speech isolation
5. "Transcribe Audio" - Convert speech to text using Whisper; outputs transcriptions with timing and reference audio
6. "Translate Transcript" - Translate text to target language using LLM; outputs translated transcriptions
7. "Save Subtitles to SRT" - If subtitleDirectory is provided, saves original.srt and translated.srt; otherwise skips
8. "Generate Dubbed Audio" - Generate TTS audio for each segment using ReplicateUtil.generateVoice(); supports user-selected TTS provider (`auto`, `qwen`, or `minimax`) and `voiceClone` toggle; outputs array of `{ path, startTime, originalDuration }`
9. "Merge Segments to Single Audio" - Mix TTS segments with original background audio: background volume reduced to 25%, TTS positioned at original timestamps with 5ms fade in/out, speed-adjusted to match segment durations, amix filter combines everything; output saved to `tmpDirectory/dubbed_full.mp3`
10. "Merge Audio with Video" - Combine dubbed audio with original video using `mergeAudioWithVideo()`; copies video stream, maps audio from second input, uses `-shortest`; final output written to `input.outputFile`
- Output: `outputFile` (path to final dubbed video)

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
- Added step versioning for checkpoint - developers can add `version` property to step to mark changes; version mismatch triggers resume from that step (2026-04-17)
- Added SRT subtitle export feature - use `--subtitleDirectory` or `-S` flag to save original.srt and translated.srt to specified directory (2026-04-17)
- Fixed FFmpeg amix filter input limit error (code 234) - added `mixTtsWithOriginalAudioBatched` function that processes segments in batches of 31 to avoid exceeding amix filter's maximum inputs; original audio is mixed with each batch, then batch results are concatenated (2026-04-18)
- Fixed background audio preservation: replaced `mergeAudioSegmentsWithTiming` with `mixTtsWithOriginalAudio` in Step 9; now mixes TTS over original background at 25% volume, with 5ms fade in/out to prevent clicks (2026-04-18)
- Added checkpoint recovery from step errors - when a step fails, checkpoint is saved with error status, allowing re-run to resume from the failed step (2026-04-17)
- Replaced buggy batched TTS merging logic with \processAndMergeDubbedAudio\ (2026-04-18): now computes target durations properly to change speed, generates a continuous timeline using the ffmpeg concat demuxer to avoid CLI length limits, ensures alignment with original timestamps by padding silence, adding 5ms fade in/fade out to each voice segment, and uses amix to merge original audio (at 25% volume) with the composed dubbed track (100% volume).
- Cleaned up legacy dead code (removed commented out isolation step, deleted unused ffmpeg helper functions) in dubbing.ts and ffmpeg.ts (2026-04-18).
