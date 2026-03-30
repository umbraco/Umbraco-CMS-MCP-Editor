import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";

const inputSchema = {
  documentId: z.string().uuid().describe("The ID of the page to get version history for"),
  skip: z.number().int().min(0).optional().default(0).describe("Number of versions to skip (for pagination)"),
  take: z.number().int().min(1).max(100).optional().default(20).describe("Number of versions to return"),
};

const outputSchema = z.object({
  pageName: z.string(),
  versions: z.array(z.object({
    versionId: z.string(),
    date: z.string(),
    user: z.string().optional(),
    isCurrentPublished: z.boolean().optional(),
    isCurrentDraft: z.boolean().optional(),
  })),
  total: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-versions",
  description: "List the version history of a content page. Shows when each version was saved and by whom. Use this to find a version ID before rolling back.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ documentId, skip, take }) => {
    // Fetch page details for context
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: documentId });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Fetch version history
    const versionResult = await mcpClientManager.callTool("cms", "get-document-version", {
      documentId,
      skip,
      take,
    });
    if (versionResult.isError) return createToolResultError(versionResult);
    const versionData = extractChainedResult(versionResult);

    const versions = (versionData.items ?? []).map((v: any) => ({
      versionId: v.id ?? v.versionId,
      date: v.date ?? v.versionDate ?? v.createDate ?? "Unknown",
      user: v.user?.name ?? v.userName ?? undefined,
      isCurrentPublished: v.isCurrentPublishedVersion ?? undefined,
      isCurrentDraft: v.isCurrentDraftVersion ?? undefined,
    }));

    return createToolResult({
      pageName,
      versions,
      total: versionData.total ?? versions.length,
    });
  },
};

export default withStandardDecorators(tool);
