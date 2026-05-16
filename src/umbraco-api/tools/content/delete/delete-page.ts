import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPublishedUrls, publishedUrlsSchema } from "../../helpers/preview-url.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  previouslyPublishedUrls: publishedUrlsSchema.describe("Live URLs this page resolved to BEFORE it was sent to the recycle bin — now dead. Surface as 'previously at' so the editor knows what just came offline."),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-page",
  description: "Move a content page to the recycle bin. The page can be restored later if needed. You will be asked to confirm before deleting.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";

    const confirmMessage = `WARNING: Move "${pageName}" to the recycle bin? This will remove the page from the site.`;

    if (!await requestApproval(extra, confirmMessage)) {
      return createToolResult({ message: "Delete cancelled", id, name: pageName, previouslyPublishedUrls: [] });
    }

    // Capture live URLs BEFORE the recycle-bin move so we can hand the editor
    // "previously at <url>" rather than a dead-on-arrival link list.
    const previouslyPublishedUrls = await fetchPublishedUrls(id);

    const deleteResult = await chainCms("move-document-to-recycle-bin", { id });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({
      message: `Moved "${pageName}" to the recycle bin`,
      id,
      name: pageName,
      previouslyPublishedUrls,
    });
  },
};

export default withStandardDecorators(tool);
