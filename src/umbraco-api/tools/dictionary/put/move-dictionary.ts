import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
    const [itemResult, targetResult] = await Promise.all([
      chainCms("get-dictionary", { id }),
      targetParentId ? chainCms("get-dictionary", { id: targetParentId }) : Promise.resolve(null),
    ]);

    if (!itemResult.ok) return itemResult.errorResult;
    const name = itemResult.data.name;

    let targetLabel = "the root";
    if (targetParentId) {
      if (targetResult && !targetResult.ok) return targetResult.errorResult;
      const target = targetResult?.ok ? targetResult.data : null;
      targetLabel = target ? `"${target.name}"` : "the root";
    }

    if (!await requestApproval(extra, `Move dictionary item "${name}" to ${targetLabel}?`)) {
      return createToolResult({ message: "Move cancelled", id, name });
    }

    const moveResult = await chainCms("move-dictionary-item", {
      id,
      data: { target: targetParentId ? { id: targetParentId } : null },
    });
    if (!moveResult.ok) return moveResult.errorResult;

    return createToolResult({
      message: `Moved "${name}" to ${targetLabel}`,
      id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
