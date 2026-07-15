import { z } from "zod";
import { withStandardDecorators, createToolResult, requestApproval, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the element to delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-element",
  description: "Move a Library element to the recycle bin. It can be restored later. You will be asked to confirm before deleting.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    const elResult = await chainCms("get-element-by-id", { id });
    if (!elResult.ok) return elResult.errorResult;
    const elementName = (elResult.data as any).variants?.[0]?.name ?? "Unknown";

    if (!await requestApproval(extra, `WARNING: Move element "${elementName}" to the recycle bin? This will remove it from the Library.`)) {
      return createToolResult({ message: "Delete cancelled", id, name: elementName });
    }

    const deleteResult = await chainCms("move-element-to-recycle-bin", { id });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({ message: `Moved element "${elementName}" to the recycle bin`, id, name: elementName });
  },
};

export default withStandardDecorators(tool);
