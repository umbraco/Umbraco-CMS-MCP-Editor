import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, UmbracoManagementClient, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to restore from the recycle bin"),
  parentId: z.string().uuid().optional().describe("The parent page ID to restore under. If not provided, the page is restored to the content root."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "restore-page",
  description: "Restore a content page from the recycle bin. Optionally specify a parent page ID, otherwise it restores to the content root. You will be asked to confirm before restoring.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, parentId }, extra) => {
    let pageName = "Unknown";
    const docResult = await chainCms("get-document-by-id", { id });
    if (docResult.ok) {
      pageName = docResult.data.variants?.[0]?.name ?? "Unknown";
    }

    if (!await requestApproval(extra, `Restore "${pageName}" from the recycle bin?`)) {
      return createToolResult({ message: "Restore cancelled", id, name: pageName });
    }

    // Call the Umbraco API directly because the CMS dev tool hardcodes target: null which fails for documents
    const target = parentId ? { id: parentId } : null;
    try {
      await UmbracoManagementClient({
        url: `/umbraco/management/api/v1/recycle-bin/document/${id}/restore`,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        data: { target },
      });
    } catch (error: any) {
      const detail = error?.message ?? String(error);
      return createToolResultError({
        status: error?.status ?? 500,
        title: "Restore failed",
        detail: `Could not restore "${pageName}" (${id}): ${detail}`,
      });
    }

    return createToolResult({
      message: `Restored "${pageName}" from the recycle bin`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
