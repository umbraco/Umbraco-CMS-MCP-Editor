import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {};

const outputSchema = z.object({
  totalMembers: z.number().describe("Total number of members across all types and groups"),
  byType: z.array(z.object({
    memberType: z.string().describe("Member type alias or name"),
    count: z.number(),
  })).describe("Member counts grouped by member type. Maps naturally to a pie or bar chart."),
  byGroup: z.array(z.object({
    group: z.string().describe("Member group name"),
    count: z.number(),
  })).describe("Member counts grouped by member group. Members with no group are excluded."),
});

const PAGE_SIZE = 100;
const MEMBER_CAP = 500;

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-member-count",
  description: "Returns a breakdown of member counts by type and group. Analyses up to 500 members — results may be incomplete on larger sites. Data maps naturally to pie or bar charts.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async () => {
    // Fetch all members via paginated calls (capped at 500)
    const allMembers: any[] = [];
    let skip = 0;
    let total = Infinity;

    while (allMembers.length < MEMBER_CAP && allMembers.length < total) {
      const result = await mcpClientManager.callTool("cms", "find-member", { take: PAGE_SIZE, skip });
      if (result.isError) return createToolResultError(result);
      const data = extractChainedResult(result);
      total = data.total ?? 0;
      const items: any[] = data.items ?? [];
      allMembers.push(...items);
      if (items.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    // Group by member type
    const typeCounts = new Map<string, number>();
    for (const member of allMembers) {
      const memberType: string = member.memberType?.alias ?? member.memberType ?? "Unknown";
      typeCounts.set(memberType, (typeCounts.get(memberType) ?? 0) + 1);
    }

    // Fetch all member groups to build group name list
    const groupResult = await mcpClientManager.callTool("cms", "get-all-member-groups", {});
    if (groupResult.isError) return createToolResultError(groupResult);
    const groupData = extractChainedResult(groupResult);
    const allGroups: any[] = groupData.items ?? [];

    // Count members per group using the member's groups array
    const groupCounts = new Map<string, number>();
    for (const group of allGroups) {
      groupCounts.set(group.name ?? group.id, 0);
    }
    for (const member of allMembers) {
      const memberGroups: string[] = member.groups ?? [];
      for (const groupName of memberGroups) {
        groupCounts.set(groupName, (groupCounts.get(groupName) ?? 0) + 1);
      }
    }

    return createToolResult({
      totalMembers: allMembers.length,
      byType: Array.from(typeCounts.entries())
        .map(([memberType, count]) => ({ memberType, count }))
        .sort((a, b) => b.count - a.count),
      byGroup: Array.from(groupCounts.entries())
        .map(([group, count]) => ({ group, count }))
        .sort((a, b) => b.count - a.count),
    });
  },
};

export default withStandardDecorators(tool);
