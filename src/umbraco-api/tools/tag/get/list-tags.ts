import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  tagGroup: z.string().optional().describe("Filter tags by group name, or omit to list all tags"),
  take: z.number().optional().default(50).describe("Number of tags to return"),
  skip: z.number().optional().default(0).describe("Number of tags to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      group: z.string(),
      nodeCount: z.number(),
    })
  ).describe("Tags in use across the site"),
  total: z.number().describe("Total number of tags"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-tags",
  description: "List tags in use across the site. Optionally filter by tag group. Shows how many content items use each tag.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ tagGroup, take, skip }) => {
    const result = await chainCms("get-tags", { tagGroup, cursor: buildChainedCursor(skip, take) });
    if (!result.ok) return result.errorResult;
    return createToolResult({
      items: (result.data.items ?? []).map((item) => ({
        id: item.id,
        name: item.text ?? "",
        group: item.group ?? "",
        nodeCount: item.nodeCount ?? 0,
      })),
      total: result.data.total,
    });
  },
};

export default withStandardDecorators(tool);
