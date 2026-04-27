import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    alias: z.string(),
    name: z.string(),
  })).describe("Available member types"),
  total: z.number().describe("Total number of member types"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-member-types",
  description: "List available member types. Use this before create-member to find a valid member type ID.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    const result = await chainCms("get-member-type-root", { cursor: buildChainedCursor(skip, take) });
    if (!result.ok) return result.errorResult;
    return createToolResult({
      items: (result.data.items ?? []).map((item) => ({
        id: item.id,
        alias: (item as { alias?: string }).alias ?? "",
        name: item.name ?? "",
      })),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
