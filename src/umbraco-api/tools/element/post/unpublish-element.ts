import { z } from "zod";
import { withStandardDecorators, createToolResult, requestApproval, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the element to unpublish"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "unpublish-element",
  description: "Unpublish a Library element, taking it offline. The element still exists as a draft. You will be asked to confirm before unpublishing.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    const elResult = await chainCms("get-element-by-id", { id });
    if (!elResult.ok) return elResult.errorResult;
    const el = elResult.data as any;
    const elementName = el.variants?.[0]?.name ?? "Unknown";

    if (!await requestApproval(extra, `Unpublish element "${elementName}"? This will take it offline.`)) {
      return createToolResult({ message: "Unpublish cancelled", id, name: elementName });
    }

    // Mirror unpublish-document: cultures: null for invariant content ([] is rejected).
    const cultures = (el.variants ?? []).filter((v: any) => v.culture).map((v: any) => v.culture as string);
    const result = await chainCms("unpublish-element", {
      id, data: { cultures: cultures.length > 0 ? cultures : null },
    });
    if (!result.ok) return result.errorResult;

    return createToolResult({ message: `Unpublished element "${elementName}" — it is now a draft only`, id, name: elementName });
  },
};

export default withStandardDecorators(tool);
