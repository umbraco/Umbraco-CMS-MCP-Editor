import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the content page or media item to look up references for"),
  type: z.enum(["document", "media"]).describe("Whether the ID refers to a content document or a media item"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  type: z.enum(["document", "media"]),
  referencedBy: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
    })
  ).describe("Pages that reference this item"),
  referenceCount: z.number().describe("Total number of pages referencing this item"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-content-references",
  description: "Find which pages reference a given content page or media item. Useful before deleting or restructuring content to understand the impact.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, type }) => {
    if (type === "document") {
      const [docResult, refResult] = await Promise.all([
        mcpClientManager.callTool("cms", "get-document-by-id", { id }),
        mcpClientManager.callTool("cms", "get-document-by-id-referenced-by", { id }),
      ]);

      let name = "Unknown";
      let url = "";
      if (!docResult.isError) {
        const doc = extractChainedResult(docResult);
        const variant = doc.variants?.[0] ?? {};
        name = variant.name ?? doc.name ?? "Unknown";
        url = doc.urls?.[0]?.url ?? "";
      }

      const referencedBy: { id: string; name: string; url: string; documentType: string }[] = [];
      if (!refResult.isError) {
        const refData = extractChainedResult(refResult);
        const refs: any[] = refData?.items ?? (Array.isArray(refData) ? refData : []);
        for (const ref of refs) {
          referencedBy.push({
            id: ref.id ?? "",
            name: ref.name ?? ref.variants?.[0]?.name ?? "Unknown",
            url: ref.urls?.[0]?.url ?? ref.url ?? "",
            documentType: ref.documentType?.alias ?? ref.contentType?.alias ?? "",
          });
        }
      }

      return createToolResult({
        id,
        name,
        url,
        type: "document",
        referencedBy,
        referenceCount: referencedBy.length,
      });
    } else {
      const [mediaResult, urlResult, refResult] = await Promise.all([
        mcpClientManager.callTool("cms", "get-media-by-id", { id }),
        mcpClientManager.callTool("cms", "get-media-urls", { id: [id] }),
        mcpClientManager.callTool("cms", "get-media-by-id-referenced-by", { id }),
      ]);

      let name = "Unknown";
      if (!mediaResult.isError) {
        const media = extractChainedResult(mediaResult);
        name = media.variants?.[0]?.name ?? media.name ?? "Unknown";
      }

      let url = "";
      if (!urlResult.isError) {
        const urlData = extractChainedResult(urlResult);
        url = urlData?.[0]?.url ?? urlData?.url ?? "";
      }

      const referencedBy: { id: string; name: string; url: string; documentType: string }[] = [];
      if (!refResult.isError) {
        const refData = extractChainedResult(refResult);
        const refs: any[] = refData?.items ?? (Array.isArray(refData) ? refData : []);
        for (const ref of refs) {
          referencedBy.push({
            id: ref.id ?? "",
            name: ref.name ?? ref.variants?.[0]?.name ?? "Unknown",
            url: ref.urls?.[0]?.url ?? ref.url ?? "",
            documentType: ref.documentType?.alias ?? ref.contentType?.alias ?? "",
          });
        }
      }

      return createToolResult({
        id,
        name,
        url,
        type: "media",
        referencedBy,
        referenceCount: referencedBy.length,
      });
    }
  },
};

export default withStandardDecorators(tool);
