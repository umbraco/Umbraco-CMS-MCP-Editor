import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the redirect to delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  originalUrl: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-redirect",
  description: "Delete a URL redirect. Visitors following the original URL will get a 404 error. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    // Step 1: Fetch redirect details for confirmation
    const itemResult = await chainCms("get-redirect-by-id", { id });
    if (!itemResult.ok) return itemResult.errorResult;
    // The dev MCP types this as { items: [...] } but the runtime response is the
    // single redirect at the top level. Narrow at this single boundary.
    const item = itemResult.data as { originalUrl?: string; url?: string; destinationUrl?: string; destinationPath?: string };
    const originalUrl = item.originalUrl ?? item.url ?? "Unknown";
    const destinationUrl = item.destinationUrl ?? item.destinationPath ?? "Unknown";

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Delete redirect from "${originalUrl}" to "${destinationUrl}"? Visitors following the old URL will get a 404.`, { title: "Confirm delete redirect", defaultValue: false })) {
      return createToolResult({ message: "Delete cancelled", id, originalUrl });
    }

    // Step 3: Delete the redirect
    const deleteResult = await chainCms("delete-redirect", { id });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({
      message: `Deleted redirect from "${originalUrl}"`,
      id,
      originalUrl,
    });
  },
};

export default withStandardDecorators(tool);
