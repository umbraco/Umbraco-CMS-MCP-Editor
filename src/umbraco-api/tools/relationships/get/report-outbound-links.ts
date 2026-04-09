import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractLinksFromValues } from "../../helpers/link-extractor.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to analyze for outbound links"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  internalPages: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
    })
  ).describe("Content pages referenced by this page"),
  media: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mediaType: z.string(),
    })
  ).describe("Media items referenced by this page"),
  externalUrls: z.array(
    z.object({
      url: z.string(),
      domain: z.string(),
    })
  ).describe("External URLs found in this page's content"),
  summary: z.object({
    internalPageCount: z.number(),
    mediaCount: z.number(),
    externalUrlCount: z.number(),
    totalLinks: z.number(),
  }),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-outbound-links",
  description: "Show everything a page links to — internal content pages, media items, and external URLs. Extracts references from content pickers, media pickers, rich text links, and block content. Use this to understand a page's dependencies before restructuring.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = extractChainedResult(result);

    const variant = doc.variants?.[0] ?? {};
    const name = variant.name ?? doc.name ?? "Unknown";
    const url = doc.urls?.[0]?.url ?? "";
    const values: any[] = doc.values ?? [];

    // Extract all outbound references
    const links = extractLinksFromValues(values);

    // Resolve UUIDs: try each as document first, then as media
    const internalPages: { id: string; name: string; url: string; documentType: string }[] = [];
    const media: { id: string; name: string; mediaType: string }[] = [];

    // Filter out the page's own ID from references
    const candidateIds = links.contentIds.filter((cid) => cid !== id.toLowerCase());

    await Promise.all(
      candidateIds.map(async (refId) => {
        try {
          // Try as document first
          const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: refId });
          if (!docResult.isError) {
            const refDoc = extractChainedResult(docResult);
            const refVariant = refDoc.variants?.[0] ?? {};
            internalPages.push({
              id: refId,
              name: refVariant.name ?? refDoc.name ?? "Unknown",
              url: refDoc.urls?.[0]?.url ?? "",
              documentType: refDoc.documentType?.alias ?? "",
            });
            return;
          }
        } catch {
          // Not a document — try media
        }

        try {
          const mediaResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: refId });
          if (!mediaResult.isError) {
            const refMedia = extractChainedResult(mediaResult);
            media.push({
              id: refId,
              name: refMedia.variants?.[0]?.name ?? refMedia.name ?? "Unknown",
              mediaType: refMedia.mediaType?.alias ?? refMedia.contentTypeAlias ?? "",
            });
          }
        } catch {
          // Neither document nor media — skip
        }
      })
    );

    return createToolResult({
      id,
      name,
      url,
      internalPages,
      media,
      externalUrls: links.externalUrls,
      summary: {
        internalPageCount: internalPages.length,
        mediaCount: media.length,
        externalUrlCount: links.externalUrls.length,
        totalLinks: internalPages.length + media.length + links.externalUrls.length,
      },
    });
  },
};

export default withStandardDecorators(tool);
