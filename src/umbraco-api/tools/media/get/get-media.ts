import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the media item to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.string(),
  urls: z.array(z.string()),
  values: z.array(z.object({
    alias: z.string(),
    value: z.any(),
    culture: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
  })),
  variants: z.array(z.object({
    name: z.string(),
    culture: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
  })),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-media",
  description: "Get the full details of a media item including URLs, dimensions, and properties. Use search-media or list-media-children to find items first.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const [mediaResult, urlResult] = await Promise.all([
      chainCms("get-media-by-id", { id }),
      chainCms("get-media-urls", { id: [id] }),
    ]);

    if (!mediaResult.ok) return mediaResult.errorResult;
    if (!urlResult.ok) return urlResult.errorResult;

    const media = mediaResult.data;
    const urlEntry = (urlResult.data.items ?? []).find((u) => u.id === id);
    const urls: string[] = (urlEntry?.urlInfos ?? [])
      .map((u) => u.url)
      .filter((u): u is string => typeof u === "string");

    return createToolResult({
      id: media.id,
      name: media.variants?.[0]?.name ?? "Unknown",
      mediaType: (media.mediaType as { alias?: string })?.alias ?? "",
      urls,
      values: media.values ?? [],
      variants: media.variants ?? [],
    });
  },
};

export default withStandardDecorators(tool);
