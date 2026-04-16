import type z from "zod";

export type StepStatus =
	| "pending"
	| "running"
	| "completed"
	| "error"
	| "cancelled";

export type PromisAble<T> = T | Promise<T>;

export interface StepArgs<Input> {
	input: Input;
	context: StepContext;
}

export interface StepContext {
	signal: AbortSignal;
	previousOutputs: Record<number, unknown>;
	args: Record<string, unknown>;
}

export interface Step<Input, Output> {
	name: string;
	description: string;
	handler: (args: StepArgs<Input>) => PromisAble<Output>;
}

export interface Pipeline<
	InputSchema extends z.ZodSchema,
	OutputSchema extends z.ZodSchema,
> {
	name: string;
	description: string;
	allowTypes: string[];
	inputType: InputSchema;
	outputType?: OutputSchema;
	steps: Step<z.infer<InputSchema>, unknown>[];
}

export function definePipeline<
	InputSchema extends z.ZodSchema,
	OutputSchema extends z.ZodSchema,
>(
	config: Pipeline<InputSchema, OutputSchema>,
): Pipeline<InputSchema, OutputSchema> {
	return config;
}
