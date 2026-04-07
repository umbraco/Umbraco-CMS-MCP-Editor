import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  name: z.string().describe("The name of the new member group"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-member-group",
  description: "Create a new member group. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name }, extra) => {
    // Elicit confirmation
    if (!await confirmAction(extra, `Create member group "${name}"?`, { title: "Confirm create member group" })) {
      return createToolResult({ message: "Create cancelled", id: "", name });
    }

    // Delegate to CMS MCP
    const createResult = await mcpClientManager.callTool("cms", "create-member-group", { name });
    if (createResult.isError) return createToolResultError(createResult);

    const created = extractChainedResult(createResult);
    const createdId = created?.id ?? "";

    return createToolResult({
      message: `Created member group "${name}"`,
      id: createdId,
      name,
    });
  },
};

export default withStandardDecorators(tool);
