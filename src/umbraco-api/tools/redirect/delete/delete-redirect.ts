import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, encodeCursor, requestApproval } from "@umbraco-cms/mcp-server-sdk";
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
    // Fetch redirect details for the confirmation message. Use get-all-redirects
    // and find by id rather than get-redirect-by-id — the latter doesn't
    // reliably include originalUrl in its response.
    const listResult = await chainCms("get-all-redirects", {
      cursor: encodeCursor({ s: 0, t: 100 }),
    });
    if (!listResult.ok) return listResult.errorResult;

    const match = (listResult.data.items ?? []).find((r: any) => r.id === id);
    if (!match) {
      return createToolResultError({
        status: 404,
        title: "Redirect not found",
        detail: `No redirect found with id ${id}. Use list-redirects to see existing redirect IDs.`,
      });
    }

    const m = match as { originalUrl?: string; url?: string; destinationUrl?: string; destinationPath?: string };
    const originalUrl = m.originalUrl ?? m.url ?? "Unknown";
    const destinationUrl = m.destinationUrl ?? m.destinationPath ?? "Unknown";

    // Step 2: Elicit confirmation
    if (!await requestApproval(extra, `Delete redirect from "${originalUrl}" to "${destinationUrl}"? Visitors following the old URL will get a 404.`)) {
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
