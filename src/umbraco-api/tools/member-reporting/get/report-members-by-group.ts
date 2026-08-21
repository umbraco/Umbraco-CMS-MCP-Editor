import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

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
    // Step 1: Confirm the group exists (case-insensitive) and get its canonical name.
    const groupsResult = await chainCms("get-all-member-groups", { cursor: undefined });
    if (!groupsResult.ok) return groupsResult.errorResult;
    const groupMatch = (groupsResult.data.items ?? []).find(
      (g: any) => g.name?.toLowerCase() === groupName.toLowerCase(),
    );
    if (!groupMatch) {
      return createToolResultError({
        status: 404,
        title: "Member group not found",
        detail: `No member group named "${groupName}". Use list-member-groups to see existing group names.`,
      });
    }

    // Step 2: Fetch members via the server-side memberGroupName filter.
    // find-member's per-item `groups` field isn't reliably populated by the
    // search index, so it can't be used for a client-side re-filter — but
    // the memberGroupName filter itself is applied server-side and is reliable.
    const result = await chainCms("find-member", {
      memberGroupName: groupMatch.name,
      cursor: buildChainedCursor(skip, take),
      orderBy: "username",
    });
    if (!result.ok) return result.errorResult;
    const items: any[] = result.data.items ?? [];

    return createToolResult({
      groupName,
      items: items.map((m: any) => ({
        id: m.id ?? "",
        name: m.variants?.[0]?.name ?? "Unknown",
        email: m.email ?? "",
        isApproved: m.isApproved ?? false,
        lastLoginDate: m.lastLoginDate ?? null,
      })),
      total: result.data.total ?? items.length,
    });
  },
};

export default withStandardDecorators(tool);
