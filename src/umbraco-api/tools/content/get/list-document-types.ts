import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";


const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })).describe("Available document types"),
  total: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-document-types",
  description: "List available document types that can be used to create new pages. Returns the ID, alias, and name of each type. Use this before create-page to find the correct documentTypeId. Returns up to 50 by default — use nextCursor from the response to fetch more.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    const result = await chainCms("get-document-type-root", { cursor: buildChainedCursor(skip, take) });
    if (!result.ok) return result.errorResult;

    return createToolResult({
      items: (result.data.items ?? []).map((item) => {
        const extra = item as { alias?: string; description?: string };
        return {
          id: item.id,
          alias: extra.alias ?? "unknown",
          name: item.name ?? extra.alias ?? "Unknown",
          description: extra.description || undefined,
          icon: item.icon || undefined,
        };
      }),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
