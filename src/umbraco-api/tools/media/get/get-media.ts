import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the media item to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.string(),
  urls: z.array(z.string()),
  values: z.array(z.any()),
  variants: z.array(z.any()),
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
      mcpClientManager.callTool("cms", "get-media-by-id", { id }),
      mcpClientManager.callTool("cms", "get-media-urls", { id: [id] }),
    ]);

    if (mediaResult.isError) return createToolResultError(mediaResult);
    if (urlResult.isError) return createToolResultError(urlResult);

    const media = extractChainedResult(mediaResult);
    const urlData = extractChainedResult(urlResult);

    const urlEntry = (urlData ?? []).find((u: any) => u.id === id);
    const urls: string[] = urlEntry?.urls ?? [];

    return createToolResult({
      id: media.id,
      name: media.variants?.[0]?.name ?? media.name ?? "Unknown",
      mediaType: media.mediaType?.alias ?? media.mediaType ?? "",
      urls,
      values: media.values ?? [],
      variants: media.variants ?? [],
    });
  },
};

export default withStandardDecorators(tool);
