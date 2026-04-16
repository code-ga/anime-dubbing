import type { StepStatus } from "./pipeline";

export interface CheckpointData {
	pipelineName: string;
	currentStepIndex: number;
	stepStatuses: StepStatus[];
	stepNames: string[];
	previousOutputs: Record<number, unknown>;
	input: unknown;
	timestamp: string;
	version: number;
}

export const CHECKPOINT_VERSION = 1;
export const CHECKPOINT_FILENAME = ".pipeline-checkpoint.json";
