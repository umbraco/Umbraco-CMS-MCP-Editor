import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractLinksFromValues } from "../../helpers/link-extractor.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to map relationships for"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  inbound: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
    })
  ).describe("Pages that reference this page"),
  outbound: z.object({
    internalPages: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string(),
        documentType: z.string(),
      })
    ).describe("Content pages this page references"),
    media: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        mediaType: z.string(),
      })
    ).describe("Media items this page references"),
    externalUrls: z.array(
      z.object({
        url: z.string(),
        domain: z.string(),
      })
    ).describe("External URLs in this page's content"),
  }),
  summary: z.object({
    inboundCount: z.number(),
    outboundInternalCount: z.number(),
    outboundMediaCount: z.number(),
    outboundExternalCount: z.number(),
    totalConnections: z.number(),
  }),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-relationship-map",
  description: "Full bidirectional relationship view for a page — everything that references it (inbound) and everything it references (outbound: content, media, external URLs). The one-stop tool for understanding a page's connections before making changes.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    // Fetch document and inbound references in parallel
    const [docResult, refResult] = await Promise.all([
      mcpClientManager.callTool("cms", "get-document-by-id", { id }),
      mcpClientManager.callTool("cms", "get-document-by-id-referenced-by", { id }),
    ]);

    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);

    const variant = doc.variants?.[0] ?? {};
    const name = variant.name ?? doc.name ?? "Unknown";
    const url = doc.urls?.[0]?.url ?? "";

    // Inbound references
    const inbound: { id: string; name: string; url: string; documentType: string }[] = [];
    if (!refResult.isError) {
      const refData = extractChainedResult(refResult);
      const refs: any[] = refData?.items ?? (Array.isArray(refData) ? refData : []);
      for (const ref of refs) {
        inbound.push({
          id: ref.id ?? "",
          name: ref.name ?? ref.variants?.[0]?.name ?? "Unknown",
          url: ref.urls?.[0]?.url ?? ref.url ?? "",
          documentType: ref.documentType?.alias ?? ref.contentType?.alias ?? "",
        });
      }
    }

    // Outbound references
    const values: any[] = doc.values ?? [];
    const links = extractLinksFromValues(values);

    const internalPages: { id: string; name: string; url: string; documentType: string }[] = [];
    const media: { id: string; name: string; mediaType: string }[] = [];

    const candidateIds = links.contentIds.filter((cid) => cid !== id.toLowerCase());

    await Promise.all(
      candidateIds.map(async (refId) => {
        try {
          const docRes = await mcpClientManager.callTool("cms", "get-document-by-id", { id: refId });
          if (!docRes.isError) {
            const refDoc = extractChainedResult(docRes);
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
          // Not a document
        }

        try {
          const mediaRes = await mcpClientManager.callTool("cms", "get-media-by-id", { id: refId });
          if (!mediaRes.isError) {
            const refMedia = extractChainedResult(mediaRes);
            media.push({
              id: refId,
              name: refMedia.variants?.[0]?.name ?? refMedia.name ?? "Unknown",
              mediaType: refMedia.mediaType?.alias ?? refMedia.contentTypeAlias ?? "",
            });
          }
        } catch {
          // Neither document nor media
        }
      })
    );

    return createToolResult({
      id,
      name,
      url,
      inbound,
      outbound: {
        internalPages,
        media,
        externalUrls: links.externalUrls,
      },
      summary: {
        inboundCount: inbound.length,
        outboundInternalCount: internalPages.length,
        outboundMediaCount: media.length,
        outboundExternalCount: links.externalUrls.length,
        totalConnections: inbound.length + internalPages.length + media.length + links.externalUrls.length,
      },
    });
  },
};

export default withStandardDecorators(tool);
