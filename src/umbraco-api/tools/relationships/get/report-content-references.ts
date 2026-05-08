import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
        chainCms("get-document-by-id", { id }),
        chainCms("get-document-by-id-referenced-by", { id }),
      ]);

      let name = "Unknown";
      let url = "";
      if (docResult.ok) {
        const doc = docResult.data;
        name = doc.variants?.[0]?.name ?? "Unknown";
        // GetDocumentByIdOutput doesn't include `urls` — runtime field, not in the upstream Zod schema.
        url = (doc as { urls?: { url?: string }[] }).urls?.[0]?.url ?? "";
      }

      const referencedBy: { id: string; name: string; url: string; documentType: string }[] = [];
      if (refResult.ok) {
        for (const ref of refResult.data.items ?? []) {
          if (ref.$type === "DocumentReferenceResponseModel") {
            referencedBy.push({
              id: ref.id,
              name: ref.variants?.[0]?.name ?? ref.name ?? "(unnamed)",
              url: (ref as { urls?: { url?: string }[]; url?: string }).urls?.[0]?.url ?? (ref as { url?: string }).url ?? "",
              documentType: ref.documentType?.alias ?? "",
            });
          } else {
            referencedBy.push({
              id: ref.id,
              name: ref.name ?? "(unnamed)",
              url: "",
              documentType: "",
            });
          }
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
        chainCms("get-media-by-id", { id }),
        chainCms("get-media-urls", { id: [id] }),
        chainCms("get-media-by-id-referenced-by", { id }),
      ]);

      let name = "Unknown";
      if (mediaResult.ok) {
        name = mediaResult.data.variants?.[0]?.name ?? "Unknown";
      }

      let url = "";
      if (urlResult.ok) {
        const entry = urlResult.data.items?.find((u) => u.id === id);
        url = entry?.urlInfos?.[0]?.url ?? "";
      }

      const referencedBy: { id: string; name: string; url: string; documentType: string }[] = [];
      if (refResult.ok) {
        for (const ref of refResult.data.items ?? []) {
          if (ref.$type === "DocumentReferenceResponseModel") {
            referencedBy.push({
              id: ref.id,
              name: ref.variants?.[0]?.name ?? ref.name ?? "(unnamed)",
              url: (ref as { urls?: { url?: string }[]; url?: string }).urls?.[0]?.url ?? (ref as { url?: string }).url ?? "",
              documentType: ref.documentType?.alias ?? "",
            });
          } else {
            referencedBy.push({
              id: ref.id,
              name: ref.name ?? "(unnamed)",
              url: "",
              documentType: "",
            });
          }
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
