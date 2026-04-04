import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the dictionary item to move"),
  targetParentId: z.string().uuid().optional().describe("UUID of the destination parent dictionary item, or omit to move to the root"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "move-dictionary",
  description: "Move a dictionary item to a different parent in the dictionary tree, or to the root. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["move"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, targetParentId }, extra) => {
    // Fetch item name and optionally the target name in parallel
    const fetches: [Promise<any>, Promise<any> | null] = [
      mcpClientManager.callTool("cms", "get-dictionary", { id }),
      targetParentId ? mcpClientManager.callTool("cms", "get-dictionary", { id: targetParentId }) : Promise.resolve(null),
    ];
    const [itemResult, targetResult] = await Promise.all(fetches);

    if (itemResult.isError) return createToolResultError(itemResult);
    const item = extractChainedResult(itemResult);
    const name: string = item.name ?? "Unknown";

    let targetLabel = "the root";
    if (targetParentId) {
      if (targetResult && targetResult.isError) return createToolResultError(targetResult);
      const target = targetResult ? extractChainedResult(targetResult) : null;
      targetLabel = target ? `"${target.name ?? "Unknown"}"` : "the root";
    }

    if (!await confirmAction(extra, `Move dictionary item "${name}" to ${targetLabel}?`, { title: "Confirm move dictionary" })) {
      return createToolResult({ message: "Move cancelled", id, name });
    }

    const moveResult = await mcpClientManager.callTool("cms", "move-dictionary-item", {
      id,
      target: targetParentId ? { id: targetParentId } : null,
    });
    if (moveResult.isError) return createToolResultError(moveResult);

    return createToolResult({
      message: `Moved "${name}" to ${targetLabel}`,
      id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
