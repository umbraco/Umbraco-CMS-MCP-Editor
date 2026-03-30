import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { getServerRef } from "../../../server-ref.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-page",
  description: "Move a content page to the recycle bin. This is a destructive operation. You will be asked to confirm before deleting.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }) => {
    // Step 1: Fetch page details for confirmation
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = docResult.structuredContent as any;
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation with strong warning (default: false)
    const confirmMessage = `WARNING: Move "${pageName}" to the recycle bin? This will remove the page from the site.`;

    const server = getServerRef();
    const elicitResult = await server.elicitInput({
      message: confirmMessage,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm delete",
            description: confirmMessage,
            default: false,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Delete cancelled", id, name: pageName });
    }

    // Step 3: Move to recycle bin
    const deleteResult = await mcpClientManager.callTool("cms", "move-to-recycle-bin", { id });
    if (deleteResult.isError) return createToolResultError(deleteResult);

    return createToolResult({
      message: `Moved "${pageName}" to the recycle bin`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
