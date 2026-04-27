import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  query: z.string().describe("Search term to find members by name or email address"),
  take: z.number().optional().default(20).describe("Number of results to return (default 20)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    memberType: z.string(),
    isApproved: z.boolean(),
    isLockedOut: z.boolean(),
  })).describe("Matching members"),
  total: z.number().describe("Total number of matches"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "search-members",
  description: "Search for members by name or email address. Returns matching members with their approval and lockout status. Use get-member for full profile details.",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: { readOnlyHint: true },
  handler: async ({ query, take, skip }) => {
    const result = await chainCms("find-member", { filter: query, cursor: buildChainedCursor(skip, take), orderBy: "username" });
    if (!result.ok) return result.errorResult;
    const data = result.data;
    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
        email: item.email ?? "",
        memberType: item.memberType?.alias ?? item.memberType ?? "",
        isApproved: item.isApproved ?? false,
        isLockedOut: item.isLockedOut ?? false,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
