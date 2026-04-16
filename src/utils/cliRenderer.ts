import { createCliRenderer } from "@opentui/core";
import { createRoot, type Root } from "@opentui/react";

export async function renderToCli(
	element: Parameters<Root["render"]>[0],
): Promise<void> {
	const renderer = await createCliRenderer({});
	createRoot(renderer).render(element);
}
