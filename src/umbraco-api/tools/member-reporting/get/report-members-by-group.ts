import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  groupName: z.string().describe("The name of the member group to filter by. Use list-member-groups to find valid group names."),
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  groupName: z.string().describe("The group name used for this query"),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    isApproved: z.boolean(),
    lastLoginDate: z.string().nullable().describe("ISO date string of last login, or null if never logged in"),
  })).describe("Members belonging to the specified group"),
  total: z.number().describe("Total number of members in this group"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-members-by-group",
  description: "List members belonging to a specific group. Use list-member-groups to find valid group names.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ groupName, take, skip }) => {
    // Attempt group-filtered search. The CMS find-member API may support memberGroupName filtering.
    // If not, we fall back to fetching all members and filtering client-side.
    const result = await mcpClientManager.callTool("cms", "find-member", {
      memberGroupName: groupName,
      take,
      skip,
    });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    const items: any[] = data.items ?? [];

    // If the API returned an unfiltered result set (doesn't support memberGroupName),
    // do a client-side filter on the member's groups array.
    const filtered = items.filter((m: any) => {
      const groups: string[] = m.groups ?? [];
      return groups.some((g) => g.toLowerCase() === groupName.toLowerCase());
    });

    // If the API natively filtered (filtered length same as items), use API total.
    // If we had to filter client-side, the total is approximate from what was returned.
    const isClientFiltered = filtered.length < items.length;
    const total = isClientFiltered ? filtered.length : (data.total ?? items.length);

    return createToolResult({
      groupName,
      items: filtered.map((m: any) => ({
        id: m.id ?? "",
        name: m.variants?.[0]?.name ?? m.name ?? "Unknown",
        email: m.email ?? "",
        isApproved: m.isApproved ?? false,
        lastLoginDate: m.lastLoginDate ?? null,
      })),
      total,
    });
  },
};

export default withStandardDecorators(tool);
