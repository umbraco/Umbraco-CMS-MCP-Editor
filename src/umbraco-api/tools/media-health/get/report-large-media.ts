import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { walkMediaTree } from "../../helpers/tree-walker.js";

const FOLDER_MEDIA_TYPES = ["folder", "Folder", "umbracoMediaFolder"];

const inputSchema = {
  minSizeKb: z.number().optional().default(1024).describe("Minimum file size in KB to include (default 1024 = 1MB)"),
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
      fileSizeKb: z.number().describe("File size in kilobytes"),
      dimensions: z.object({
        width: z.number().nullable(),
        height: z.number().nullable(),
      }).describe("Image dimensions, null if not available"),
    })
  ).describe("Media items above the size threshold, sorted largest first"),
  total: z.number().describe("Total number of media items above the threshold"),
  scannedItems: z.number().describe("Total number of non-folder media items scanned"),
  threshold: z.number().describe("The size threshold used for filtering, in KB"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-large-media",
  description: "Find media files above a size threshold. Default is 1MB (1024KB). Large files slow page loads and waste bandwidth. Returns file size and dimensions where available.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ minSizeKb, parentId, take, skip }) => {
    const treeItems = await walkMediaTree({ parentId, scanLimit: 100 });

    // Filter out folders
    const mediaItems = treeItems.filter(
      (item: any) => !FOLDER_MEDIA_TYPES.includes(item.mediaType?.alias ?? item.contentTypeAlias ?? "")
    );

    // Enrich each item with size and dimension data
    const enriched = await Promise.all(
      mediaItems.map(async (item: any) => {
        try {
          const [mediaResult, urlResult] = await Promise.all([
            mcpClientManager.callTool("cms", "get-media-by-id", { id: item.id }),
            mcpClientManager.callTool("cms", "get-media-urls", { id: item.id }),
          ]);

          let fileSizeKb = 0;
          let width: number | null = null;
          let height: number | null = null;

          if (!mediaResult.isError) {
            const media = extractChainedResult(mediaResult);
            const values: any[] = media.values ?? [];

            const bytesValue = values.find((v: any) => v.alias === "umbracoBytes");
            if (bytesValue && typeof bytesValue.value === "number") {
              fileSizeKb = Math.round(bytesValue.value / 1024);
            } else if (bytesValue && typeof bytesValue.value === "string") {
              fileSizeKb = Math.round((parseInt(bytesValue.value, 10) || 0) / 1024);
            }

            const widthValue = values.find((v: any) => v.alias === "umbracoWidth");
            if (widthValue && widthValue.value != null) {
              width = typeof widthValue.value === "number" ? widthValue.value : parseInt(String(widthValue.value), 10) || null;
            }

            const heightValue = values.find((v: any) => v.alias === "umbracoHeight");
            if (heightValue && heightValue.value != null) {
              height = typeof heightValue.value === "number" ? heightValue.value : parseInt(String(heightValue.value), 10) || null;
            }
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
            fileSizeKb,
            dimensions: { width, height },
          };
        } catch {
          return null;
        }
      })
    );

    // Filter to items above threshold and sort by size descending
    const aboveThreshold = enriched
      .filter((item): item is NonNullable<typeof item> => item !== null && item.fileSizeKb >= minSizeKb)
      .sort((a, b) => b.fileSizeKb - a.fileSizeKb);

    const paginated = aboveThreshold.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total: aboveThreshold.length,
      scannedItems: mediaItems.length,
      threshold: minSizeKb,
    });
  },
};

export default withStandardDecorators(tool);
