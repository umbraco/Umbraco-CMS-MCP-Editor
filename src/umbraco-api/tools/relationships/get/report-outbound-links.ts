import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { extractLinksFromValues, resolveOutboundIds } from "../../helpers/link-extractor.js";

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
    const result = await chainCms("get-document-by-id", { id });
    if (!result.ok) return result.errorResult;
    const doc = result.data;

    const variant = doc.variants?.[0];
    const name = variant?.name ?? "Unknown";
    // GetDocumentByIdOutput doesn't include `urls` — runtime field, not in the upstream Zod schema.
    const url = (doc as { urls?: { url?: string }[] }).urls?.[0]?.url ?? "";
    const values = doc.values ?? [];

    const links = extractLinksFromValues(values);
    const { internalPages, media } = await resolveOutboundIds(links.allIds, id);

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
