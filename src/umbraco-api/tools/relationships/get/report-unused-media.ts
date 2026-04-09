import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { walkMediaTree } from "../../helpers/tree-walker.js";

const FOLDER_MEDIA_TYPES = ["folder", "Folder", "umbracoMediaFolder"];

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a media folder by parent ID. Omit to scan root-level media."),
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      mediaType: z.string(),
      fileSize: z.number().describe("File size in bytes, 0 if unavailable"),
      lastModified: z.string().describe("ISO date string of last modification, empty if unavailable"),
    })
  ).describe("Media items not referenced by any content"),
  total: z.number().describe("Total number of unreferenced media items found"),
  scannedItems: z.number().describe("Total number of non-folder media items scanned"),
  totalFileSize: z.number().describe("Sum of file sizes of all unreferenced items in bytes"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-unused-media",
  description: "Find media items not referenced by any content page. Unused files waste storage and clutter the media library. Includes total file size of unused items.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const treeItems = await walkMediaTree({ parentId, scanLimit: 100 });

    // Filter out folders
    const mediaItems = treeItems.filter(
      (item: any) => !FOLDER_MEDIA_TYPES.includes(item.mediaType?.alias ?? item.contentTypeAlias ?? "")
    );

    // Check each item for references and enrich with details
    const enriched = await Promise.all(
      mediaItems.map(async (item: any) => {
        try {
          const [refResult, mediaResult, urlResult] = await Promise.all([
            mcpClientManager.callTool("cms", "get-media-are-referenced", { id: [item.id] }),
            mcpClientManager.callTool("cms", "get-media-by-id", { id: item.id }),
            mcpClientManager.callTool("cms", "get-media-urls", { id: item.id }),
          ]);

          // Check if referenced — if so, skip this item
          if (!refResult.isError) {
            const refData = extractChainedResult(refResult);
            // refData is typically an array of { id, isReferenced } or similar
            const items: any[] = Array.isArray(refData) ? refData : (refData?.items ?? []);
            const entry = items.find((r: any) => r.id === item.id);
            if (entry?.isReferenced === true) {
              return null;
            }
            // If refData is a direct boolean-like structure
            if (typeof refData?.isReferenced === "boolean" && refData.isReferenced === true) {
              return null;
            }
          }

          let fileSize = 0;
          let lastModified = "";
          if (!mediaResult.isError) {
            const media = extractChainedResult(mediaResult);
            const values: any[] = media.values ?? [];
            const bytesValue = values.find((v: any) => v.alias === "umbracoBytes");
            if (bytesValue && typeof bytesValue.value === "number") {
              fileSize = bytesValue.value;
            } else if (bytesValue && typeof bytesValue.value === "string") {
              fileSize = parseInt(bytesValue.value, 10) || 0;
            }
            lastModified = media.updateDate ?? media.createDate ?? "";
          }

          let url = "";
          if (!urlResult.isError) {
            const urlData = extractChainedResult(urlResult);
            url = urlData?.[0]?.url ?? urlData?.url ?? "";
          }

          return {
            id: item.id,
            name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
            url,
            mediaType: item.mediaType?.alias ?? item.contentTypeAlias ?? "",
            fileSize,
            lastModified,
          };
        } catch {
          return null;
        }
      })
    );

    const unreferenced = enriched.filter((item): item is NonNullable<typeof item> => item !== null);
    const totalFileSize = unreferenced.reduce((sum, item) => sum + item.fileSize, 0);
    const paginated = unreferenced.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total: unreferenced.length,
      scannedItems: mediaItems.length,
      totalFileSize,
    });
  },
};

export default withStandardDecorators(tool);
