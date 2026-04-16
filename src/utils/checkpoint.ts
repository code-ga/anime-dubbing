import { access, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckpointData } from "../types/checkpoint";
import { CHECKPOINT_FILENAME, CHECKPOINT_VERSION } from "../types/checkpoint";
import type { StepStatus } from "../types/pipeline";
import { logger } from "./logger";

export async function saveCheckpoint(
	tmpDir: string,
	data: Omit<CheckpointData, "version" | "timestamp">,
): Promise<void> {
	const checkpointData: CheckpointData = {
		...data,
		version: CHECKPOINT_VERSION,
		timestamp: new Date().toISOString(),
	};
	const filePath = path.join(tmpDir, CHECKPOINT_FILENAME);
	await writeFile(filePath, JSON.stringify(checkpointData, null, 2), "utf-8");
	logger.debug(`Checkpoint saved at step ${data.currentStepIndex}`);
}

export async function loadCheckpoint(
	tmpDir: string,
	pipelineName: string,
	stepNames: string[],
	stepVersions?: number[],
): Promise<CheckpointData | null> {
	const filePath = path.join(tmpDir, CHECKPOINT_FILENAME);
	try {
		await access(filePath);
	} catch {
		return null;
	}
	try {
		const content = await readFile(filePath, "utf-8");
		const data = JSON.parse(content) as CheckpointData;
		if (data.version !== CHECKPOINT_VERSION) {
			logger.debug(
				`Checkpoint version mismatch: expected ${CHECKPOINT_VERSION}, got ${data.version}`,
			);
			await clearCheckpoint(tmpDir);
			return null;
		}
		if (data.pipelineName !== pipelineName) {
			logger.debug(
				`Pipeline name mismatch: expected ${pipelineName}, got ${data.pipelineName}`,
			);
			return null;
		}
		if (data.stepStatuses.length !== stepNames.length) {
			logger.debug(
				`Step count mismatch: checkpoint has ${data.stepStatuses.length} steps, pipeline has ${stepNames.length} steps`,
			);
			await clearCheckpoint(tmpDir);
			return null;
		}
		const currentVersions = stepVersions ?? stepNames.map(() => 0);
		for (let i = 0; i < data.currentStepIndex; i++) {
			const checkpointStepVersion = data.stepVersions?.[i] ?? 0;
			const currentStepVersion = currentVersions[i] ?? 0;
			if (checkpointStepVersion !== currentStepVersion) {
				logger.debug(
					`Step version mismatch at index ${i}: checkpoint has version ${checkpointStepVersion}, current has version ${currentStepVersion} - resuming from step ${i}`,
				);
				const adjustedData: CheckpointData = {
					...data,
					currentStepIndex: i,
					stepStatuses: data.stepStatuses
						.slice(0, i)
						.concat(
							Array(stepNames.length - i).fill("pending") as StepStatus[],
						),
				};
				return adjustedData;
			}
		}
		for (let i = 0; i < data.currentStepIndex; i++) {
			const checkpointStepName = data.stepNames?.[i];
			const currentStepName = stepNames[i];
			if (
				checkpointStepName &&
				currentStepName &&
				checkpointStepName !== currentStepName
			) {
				logger.debug(
					`Step name mismatch at index ${i}: checkpoint has "${checkpointStepName}", pipeline has "${currentStepName}" - resuming from step ${i}`,
				);
				const adjustedData: CheckpointData = {
					...data,
					currentStepIndex: i,
					stepStatuses: data.stepStatuses
						.slice(0, i)
						.concat(
							Array(stepNames.length - i).fill("pending") as StepStatus[],
						),
				};
				return adjustedData;
			}
		}
		logger.info(
			`Found checkpoint, resuming from step ${data.currentStepIndex}`,
		);
		return data;
	} catch (error) {
		logger.debug(`Failed to load checkpoint: ${error}`);
		await clearCheckpoint(tmpDir);
		return null;
	}
}

export async function clearCheckpoint(tmpDir: string): Promise<void> {
	const filePath = path.join(tmpDir, CHECKPOINT_FILENAME);
	try {
		await unlink(filePath);
		logger.debug("Checkpoint cleared");
	} catch {
		// File doesn't exist, ignore
	}
}
