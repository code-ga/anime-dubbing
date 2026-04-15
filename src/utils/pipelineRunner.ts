import type { Pipeline, StepStatus } from "../types/pipeline";

export interface PipelineResult {
	output: unknown;
	cancelled: boolean;
}

export interface PipelineArgs {
	input: unknown;
	args: Record<string, unknown>;
}

export async function runPipeline(
	pipeline: Pipeline<any, any>,
	pipelineArgs: PipelineArgs,
	onStepChange: (step: number, status: StepStatus) => void,
	signal?: AbortSignal,
): Promise<PipelineResult> {
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
	const previousOutputs: Record<number, unknown> = {};
	let lastOutput: unknown = null;

	for (let stepIndex = 0; stepIndex < totalSteps; stepIndex++) {
		checkCancelled();
		onStepChange(stepIndex, "running");

		try {
			const parsedInput = pipeline.inputType.parse(pipelineArgs.input);
			const step = pipeline.steps[stepIndex]!;
			lastOutput = await step.handler({
				input: parsedInput,
				context: {
					signal: activeSignal,
					previousOutputs,
					args: pipelineArgs.args,
				},
			});
			previousOutputs[stepIndex] = lastOutput;
		} catch (error) {
			if (activeSignal.aborted) {
				onStepChange(stepIndex, "cancelled");
				return { output: lastOutput, cancelled: true };
			}
			onStepChange(stepIndex, "error");
			throw error;
		}
		checkCancelled();
		onStepChange(stepIndex, "completed");
	}

	return { output: lastOutput, cancelled: false };
}