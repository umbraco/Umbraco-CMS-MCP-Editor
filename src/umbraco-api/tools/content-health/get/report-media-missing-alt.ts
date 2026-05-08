import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { walkMediaTree } from "../../helpers/tree-walker.js";

const ALT_TEXT_ALIASES = ["umbracoAltText", "altText"];
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
      hasAlt: z.boolean(),
      altText: z.string(),
    })
  ).describe("Media items scanned, each with alt text status"),
  totalImages: z.number().describe("Total number of non-folder media items found"),
  missingAltCount: z.number().describe("Number of media items missing alt text"),
  scannedItems: z.number().describe("Total number of items scanned from the tree"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-media-missing-alt",
  description: "Find media images missing alt text. Scans direct children of a media folder (or root). Important for accessibility and SEO. Use parentId to scope to a specific folder.",
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

    // Enrich each item with full media data
    const enriched = await Promise.all(
      mediaItems.map(async (item: any) => {
        try {
          const mediaResult = await chainCms("get-media-by-id", { id: item.id });
          const urlResult = await chainCms("get-media-urls", { id: [item.id] });

          let altText = "";
          if (mediaResult.ok) {
            const values = mediaResult.data.values ?? [];
            for (const alias of ALT_TEXT_ALIASES) {
              const found = values.find((v) => v.alias === alias);
              if (found && typeof found.value === "string" && found.value.trim()) {
                altText = found.value.trim();
                break;
              }
            }
          }

          let url = "";
          if (urlResult.ok) {
            const entry = urlResult.data.items?.find((u) => u.id === item.id);
            url = entry?.urlInfos?.[0]?.url ?? "";
          }

          return {
            id: item.id,
            name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
            url,
            mediaType: item.mediaType?.alias ?? item.contentTypeAlias ?? "",
            hasAlt: altText.length > 0,
            altText,
          };
        } catch {
          return {
            id: item.id,
            name: item.name ?? "Unknown",
            url: "",
            mediaType: "",
            hasAlt: false,
            altText: "",
          };
        }
      })
    );

    const missingAltCount = enriched.filter((item) => !item.hasAlt).length;
    const paginated = enriched.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      totalImages: enriched.length,
      missingAltCount,
      scannedItems: treeItems.length,
    });
  },
};

export default withStandardDecorators(tool);
