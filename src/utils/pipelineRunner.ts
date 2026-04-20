import { inspect } from "node:util";
import type z from "zod";
import type { CheckpointData } from "../types/checkpoint";
import type { Pipeline, StepStatus } from "../types/pipeline";
import { logger } from "../utils/logger";
import { clearCheckpoint } from "./checkpoint";

export interface PipelineResult {
	output: unknown;
	cancelled: boolean;
}

export interface PipelineArgs<Input extends z.ZodObject> {
	input: z.infer<Input>;
	args: Record<string, unknown>;
}

export interface RunPipelineOptions {
	tmpDirectory?: string;
	checkpoint?: CheckpointData | null;
	onCheckpointSave?: (
		data: Omit<CheckpointData, "version" | "timestamp">,
	) => Promise<void>;
}

// biome-disable-next-line lint/suspicious/noExplicitAny
export async function runPipeline<Input extends z.ZodObject>(
	pipeline: Pipeline<Input, any>,
	pipelineArgs: PipelineArgs<Input>,
	onStepChange: (step: number, status: StepStatus) => void,
	signal?: AbortSignal,
	options?: RunPipelineOptions,
): Promise<PipelineResult> {
	const { tmpDirectory, checkpoint, onCheckpointSave } = options ?? {};
	const startStepIndex = checkpoint ? checkpoint.currentStepIndex + 1 : 0;
	const previousOutputs: Record<number, unknown> =
		checkpoint?.previousOutputs ?? {};
	const stepStatuses: StepStatus[] =
		checkpoint?.stepStatuses ?? pipeline.steps.map(() => "pending");
	const localAbortController = new AbortController();
	const activeSignal = signal ?? localAbortController.signal;

	if (activeSignal.aborted) {
		return { output: null, cancelled: true };
	}

	const checkCancelled = () => {
		if (activeSignal.aborted) {
			throw new Error("Pipeline cancelled");
		}
	};

	const totalSteps = pipeline.steps.length;
	let lastOutput: unknown = null;

	if (checkpoint) {
		for (let i = 0; i < startStepIndex; i++) {
			onStepChange(i, stepStatuses[i] ?? "completed");
		}
	}

	for (let stepIndex = startStepIndex; stepIndex < totalSteps; stepIndex++) {
		checkCancelled();
		onStepChange(stepIndex, "running");

		try {
			logger.debug(`Step ${stepIndex}: Parsing input...`);
			logger.debug(`PipelineArgs.input: ${JSON.stringify(pipelineArgs.input)}`);
			const parsedInput = pipeline.inputType.parse(pipelineArgs.input);
			logger.debug(
				`Parsed input for step ${stepIndex}: ${JSON.stringify(parsedInput)}`,
			);
			const step = pipeline.steps[stepIndex];
			if (!step) {
				throw new Error(`Step ${stepIndex} not found`);
			}
			logger.debug(`Running step ${stepIndex}: ${step.name}`);
			lastOutput = await step.handler({
				input: parsedInput,
				context: {
					signal: activeSignal,
					previousOutputs,
					args: pipelineArgs.args,
				},
			});
			previousOutputs[stepIndex] = lastOutput;
			stepStatuses[stepIndex] = "completed";
			if (tmpDirectory && onCheckpointSave) {
				await onCheckpointSave({
					pipelineName: pipeline.name,
					currentStepIndex: stepIndex,
					stepStatuses,
					stepNames: pipeline.steps.map((s) => s.name),
					stepVersions: pipeline.steps.map((s) => s.version ?? 0),
					previousOutputs,
					input: pipelineArgs.input,
				});
			}
		} catch (error) {
			if (activeSignal.aborted) {
				onStepChange(stepIndex, "cancelled");
				return { output: lastOutput, cancelled: true };
			}
			onStepChange(stepIndex, "error");
			logger.error(
				`Error in step ${stepIndex} (${pipeline.steps[stepIndex]?.name}):`,
				inspect(error),
			);
			stepStatuses[stepIndex] = "error";
			if (tmpDirectory && onCheckpointSave) {
				await onCheckpointSave({
					pipelineName: pipeline.name,
					currentStepIndex: stepIndex - 1,
					stepStatuses,
					stepNames: pipeline.steps.map((s) => s.name),
					stepVersions: pipeline.steps.map((s) => s.version ?? 0),
					previousOutputs,
					input: pipelineArgs.input,
				});
			}
			throw error;
		}
		checkCancelled();
		onStepChange(stepIndex, "completed");
	}

	if (tmpDirectory) {
		await clearCheckpoint(tmpDirectory);
	}

	return { output: lastOutput, cancelled: false };
}
