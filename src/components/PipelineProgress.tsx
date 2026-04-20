import { TextAttributes } from "@opentui/core";
import type { Pipeline, StepStatus } from "../types/pipeline";

// biome-disable-next-line lint/suspicious/noExplicitAny
interface PipelineProgressProps {
	pipeline: Pipeline<any, any>;
	currentStep: number;
	stepStatus: StepStatus[];
}

export function PipelineProgress({
	pipeline,
	currentStep,
	stepStatus,
}: PipelineProgressProps) {
	const completedSteps = stepStatus.filter((s) => s === "completed").length;
	const progress =
		pipeline.steps.length > 0
			? Math.round((completedSteps / pipeline.steps.length) * 100)
			: 0;

	const getStatusIcon = (status: StepStatus, index: number) => {
		if (status === "completed") return "✓";
		if (status === "error") return "✗";
		if (status === "running") return "◐";
		return index < currentStep ? "✓" : "○";
	};

	const getStatusColor = (status: StepStatus) => {
		if (status === "completed") return "#22c55e";
		if (status === "error") return "#ef4444";
		if (status === "running") return "#eab308";
		return "#6b7280";
	};

	const getProgressBar = (percent: number) => {
		const filled = Math.round((percent / 100) * 20);
		const empty = 20 - filled;
		return "█".repeat(filled) + "░".repeat(empty);
	};

	return (
		<box flexDirection="column" gap={1} padding={1}>
			<box border borderStyle="rounded" padding={1}>
				<box flexDirection="column" gap={1}>
					<text attributes={TextAttributes.BOLD}>{pipeline.name}</text>
					<text attributes={TextAttributes.DIM}>{pipeline.description}</text>
				</box>
			</box>

			<box border borderStyle="rounded" padding={1}>
				<box flexDirection="column" gap={1}>
					{stepStatus.map((status, index) => {
						const step = pipeline.steps[index];
						return (
							<box key={index} flexDirection="row" alignItems="center" gap={2}>
								<text fg={getStatusColor(status)}>
									{getStatusIcon(status, index)}
								</text>
								<text
									fg={
										status === "running"
											? "#eab308"
											: status === "completed"
												? "#22c55e"
												: status === "error"
													? "#ef4444"
													: undefined
									}
								>
									Step {index + 1}: {step?.name}
								</text>
							</box>
						);
					})}
				</box>
			</box>

			<box border borderStyle="rounded" padding={1}>
				<box flexDirection="column" gap={1}>
					<box flexDirection="row" justifyContent="space-between">
						<text>Progress</text>
						<text>{progress}%</text>
					</box>
					<text>{getProgressBar(progress)}</text>
				</box>
			</box>
		</box>
	);
}
