import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the element to publish"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "publish-element",
  description: "Publish a Library element to make its current draft live (mirrors the back office 'Save and publish' action). Edit the element first with edit-element if it needs changes. Use unpublish-element to take it back offline. NOTE: this publishes directly — if the site requires workflow approval, that must be handled separately.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id }) => {
    const elResult = await chainCms("get-element-by-id", { id });
    if (!elResult.ok) return elResult.errorResult;
    const el = elResult.data as any;
    const elementName = el.variants?.[0]?.name ?? "Unknown";

    // Mirror publish-document: one publishSchedules entry per culture (invariant
    // content yields a single `culture: null` entry). An empty array is a no-op.
    const variantCultures: Array<string | null> = (el.variants ?? []).length
      ? el.variants.map((v: any) => v.culture ?? null)
      : [null];
    const publishResult = await chainCms("publish-element", {
      id,
      data: { publishSchedules: variantCultures.map((c) => ({ culture: c })) },
    });
    if (!publishResult.ok) return publishResult.errorResult;

    return createToolResult({
      message: `Published element "${elementName}"`,
      id,
      name: elementName,
    });
  },
};

export default withStandardDecorators(tool);
