import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the member group to delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-member-group",
  description: "Delete a member group. Members in this group will lose the group assignment. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    // Step 1: Fetch group details for confirmation
    const groupResult = await mcpClientManager.callTool("cms", "get-member-group", { id });
    if (groupResult.isError) return createToolResultError(groupResult);
    const group = extractChainedResult(groupResult);
    const name = group.name ?? "Unknown";

    // Step 2: Elicit confirmation (default: false)
    const confirmMessage = `Delete member group "${name}"? Members in this group will lose this group assignment.`;

    if (!await confirmAction(extra, confirmMessage, { title: "Confirm delete member group", defaultValue: false })) {
      return createToolResult({ message: "Delete cancelled", id, name });
    }

    // Step 3: Delete the member group
    const deleteResult = await mcpClientManager.callTool("cms", "delete-member-group", { id });
    if (deleteResult.isError) return createToolResultError(deleteResult);

    return createToolResult({
      message: `Deleted member group "${name}"`,
      id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
