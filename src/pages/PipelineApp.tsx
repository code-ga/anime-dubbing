import { TextAttributes } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { useEffect, useRef, useState } from "react";
import z from "zod";
import type { Pipeline, StepStatus } from "../types/pipeline";
import { usePipelineLogger } from "../hooks/usePipelineLogger";
import { LogViewer } from "../components/LogViewer";
import { PipelineProgress } from "../components/PipelineProgress";
import { runPipeline, type PipelineArgs } from "../utils/pipelineRunner";
import { logger, setLogCallback } from "../utils/logger";
import { ReplicateUtil } from "../class/replicate";

export interface PipelineAppProps {
	pipeline: Pipeline<any, any>;
	input: z.infer<Pipeline<any, any>["inputType"]>;
	outputFile: string;
	args?: Record<string, unknown>;
	onCancel?: () => void;
}

export function PipelineApp({ pipeline, input, outputFile, args = {}, onCancel }: PipelineAppProps) {
	const abortControllerRef = useRef<AbortController | null>(null);
	const stepStatus: StepStatus[] = pipeline.steps.map(() => "pending");
	const [localStepStatus, setLocalStepStatus] = useState<StepStatus[]>(stepStatus);
	const [localCurrentStep, setLocalCurrentStep] = useState(0);
	const [isComplete, setIsComplete] = useState(false);
	const [isCancelled, setIsCancelled] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { addLog, clearLogs, logs } = usePipelineLogger();
	const [logTrigger, setLogTrigger] = useState(0);

	const handleKeyDown = (key: KeyEvent) => {
		if (key.ctrl && key.name === "c") {
			abortControllerRef.current?.abort();
			setIsCancelled(true);
			onCancel?.();
		}
	};

	useEffect(() => {
		clearLogs();
		setLogCallback((level, message) => {
			addLog(level, message);
			setLogTrigger((t) => t + 1);
		});
		logger.info("Pipeline started:", pipeline.name);

		return () => {
			setLogCallback(null);
		};
	}, []);

	useEffect(() => {
		abortControllerRef.current = new AbortController();

		const pipelineArgs: PipelineArgs = {
			input,
			args: {
				outputFile,
				...args,
				replicateUtil: new ReplicateUtil(), // Pass ReplicateUtil instance to pipeline steps
			},
		};

		async function execute() {
			try {
				const result = await runPipeline(
					pipeline,
					pipelineArgs,
					(step: number, status: StepStatus) => {
						setLocalStepStatus((prev) => {
							const newStatus = [...prev];
							newStatus[step] = status;
							return newStatus;
						});
						setLocalCurrentStep(step);
					},
					abortControllerRef.current?.signal,
				);

				if (result.cancelled) {
					setIsCancelled(true);
				} else {
					setIsComplete(true);
				}
			} catch (err: unknown) {
				if (err instanceof Error && err.message === "Pipeline cancelled") {
					setIsCancelled(true);
				} else {
					setError(err instanceof Error ? err.message : String(err));
				}
			}
		}

		execute();

		return () => {
			abortControllerRef.current?.abort();
		};
	}, [pipeline, input, outputFile]);

	if (error) {
		return (
			<box
				alignItems="center"
				justifyContent="center"
				flexGrow={1}
				flexDirection="column"
				onKeyDown={handleKeyDown}
				focusable
			>
				<box
					border
					borderStyle="rounded"
					padding={2}
					flexDirection="column"
					gap={1}
				>
					<text fg="#ef4444">Error: {error}</text>
				</box>
				<box marginTop={1}>
					<LogViewer logs={logs.current} maxHeight={8} />
				</box>
			</box>
		);
	}

	if (isCancelled) {
		return (
			<box
				alignItems="center"
				justifyContent="center"
				flexGrow={1}
				flexDirection="column"
				onKeyDown={handleKeyDown}
				focusable
			>
				<box
					border
					borderStyle="rounded"
					padding={2}
					flexDirection="column"
					gap={1}
				>
					<text fg="#f59e0b" attributes={TextAttributes.BOLD}>
						○ Pipeline cancelled
					</text>
					<text attributes={TextAttributes.DIM}>
						Press any key to exit...
					</text>
				</box>
				<box marginTop={1}>
					<LogViewer logs={logs.current} maxHeight={8} />
				</box>
			</box>
		);
	}

	if (isComplete) {
		return (
			<box
				alignItems="center"
				justifyContent="center"
				flexGrow={1}
				flexDirection="column"
				onKeyDown={handleKeyDown}
				focusable
			>
				<box
					border
					borderStyle="rounded"
					padding={2}
					flexDirection="column"
					gap={1}
				>
					<text fg="#22c55e" attributes={TextAttributes.BOLD}>
						✓ Pipeline completed successfully!
					</text>
					<text attributes={TextAttributes.DIM}>Output: {outputFile}</text>
				</box>
				<box marginTop={1}>
					<LogViewer logs={logs.current} maxHeight={8} />
				</box>
			</box>
		);
	}

	return (
		<box
			alignItems="center"
			justifyContent="center"
			flexGrow={1}
			flexDirection="column"
			onKeyDown={handleKeyDown}
			focusable
		>
			<PipelineProgress
				pipeline={pipeline}
				currentStep={localCurrentStep}
				stepStatus={localStepStatus}
			/>
			<box marginTop={1}>
				<LogViewer logs={logs.current} maxHeight={8} />
			</box>
			<box marginTop={1}>
				<text fg="#64748b">Press Ctrl+C to cancel</text>
			</box>
		</box>
	);
}