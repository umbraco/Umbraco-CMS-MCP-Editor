import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";


const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to get version history for"),
  skip: z.number().int().min(0).optional().default(0).describe("Number of versions to skip (for pagination)"),
  take: z.number().int().min(1).max(100).optional().default(20).describe("Number of versions to return"),
};

const outputSchema = z.object({
  name: z.string(),
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
  slices: ["list", "version"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, skip, take }) => {
    // Fetch page details for context
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const name = docResult.data.variants?.[0]?.name ?? "Unknown";

    // Fetch version history
    const versionResult = await chainCms("get-document-version", {
      documentId: id,
      cursor: buildChainedCursor(skip, take),
    });
    if (!versionResult.ok) return versionResult.errorResult;

    const versions = versionResult.data.items.map((v) => ({
      versionId: v.id,
      date: v.versionDate,
      user: undefined as string | undefined,
      isCurrentPublished: v.isCurrentPublishedVersion,
      isCurrentDraft: v.isCurrentDraftVersion,
    }));

    return createToolResult({
      name,
      versions,
      total: versionResult.data.total,
    });
  },
};

export default withStandardDecorators(tool);
