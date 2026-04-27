import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
    const groupResult = await chainCms("get-member-group", { id });
    if (!groupResult.ok) return groupResult.errorResult;
    const group = groupResult.data;
    const name = group.name ?? "Unknown";

    // Step 2: Elicit confirmation (default: false)
    const confirmMessage = `Delete member group "${name}"? Members in this group will lose this group assignment.`;

    if (!await confirmAction(extra, confirmMessage, { title: "Confirm delete member group", defaultValue: false })) {
      return createToolResult({ message: "Delete cancelled", id, name });
    }

    // Step 3: Delete the member group
    const deleteResult = await chainCms("delete-member-group", { id });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({
      message: `Deleted member group "${name}"`,
      id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
