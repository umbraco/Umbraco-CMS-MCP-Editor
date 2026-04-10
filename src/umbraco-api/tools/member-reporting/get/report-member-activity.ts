import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  inactiveDays: z.number().optional().default(90).describe("Number of days without a login before a member is considered inactive (default 90)"),
  take: z.number().optional().default(50).describe("Number of results to return after filtering (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    memberType: z.string(),
    lastLoginDate: z.string().nullable().describe("ISO date string of last login, or null if the member has never logged in"),
    daysSinceLogin: z.number().nullable().describe("Days since last login, or null if the member has never logged in"),
  })).describe("Inactive members sorted most inactive first (nulls last)"),
  total: z.number().describe("Total number of inactive members found"),
  threshold: z.number().describe("The inactivity threshold in days used for this report"),
  inactiveCount: z.number().describe("Count of members exceeding the inactivity threshold (same as total)"),
});

const PAGE_SIZE = 100;
const MEMBER_CAP = 500;

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-member-activity",
  description: "Find members who haven't logged in within a given number of days. Default threshold is 90 days. Members who have never logged in are always included. Analyses up to 500 members. Useful for identifying inactive accounts.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ inactiveDays, take, skip }) => {
    // Fetch all members via paginated calls (capped at 500)
    const allMembers: any[] = [];
    let cursor: string | undefined = encodeCursor({ s: 0, t: PAGE_SIZE });

    while (allMembers.length < MEMBER_CAP) {
      const result = await mcpClientManager.callTool("cms", "find-member", { cursor });
      if (result.isError) return createToolResultError(result);
      const data = extractChainedResult(result);
      const items: any[] = data.items ?? [];
      allMembers.push(...items);
      if (!data.nextCursor || items.length === 0) break;
      cursor = data.nextCursor;
    }

    const now = Date.now();

    const withActivity = allMembers.map((member: any) => {
      const lastLoginDate: string | null = member.lastLoginDate ?? null;
      let daysSinceLogin: number | null = null;
      if (lastLoginDate) {
        const loginMs = new Date(lastLoginDate).getTime();
        if (!isNaN(loginMs)) {
          daysSinceLogin = Math.floor((now - loginMs) / (1000 * 60 * 60 * 24));
        }
      }
      return {
        id: member.id ?? "",
        name: member.variants?.[0]?.name ?? member.name ?? "Unknown",
        email: member.email ?? "",
        memberType: member.memberType?.alias ?? member.memberType ?? "",
        lastLoginDate,
        daysSinceLogin,
      };
    });

    // Filter to members exceeding the inactivity threshold (never-logged-in members are always included)
    const inactiveMembers = withActivity.filter(
      (m) => m.daysSinceLogin === null || m.daysSinceLogin >= inactiveDays
    );

    // Sort most inactive first; members who never logged in go last
    inactiveMembers.sort((a, b) => {
      if (a.daysSinceLogin === null && b.daysSinceLogin === null) return 0;
      if (a.daysSinceLogin === null) return 1;
      if (b.daysSinceLogin === null) return -1;
      return b.daysSinceLogin - a.daysSinceLogin;
    });

    const total = inactiveMembers.length;
    const paginated = inactiveMembers.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total,
      threshold: inactiveDays,
      inactiveCount: total,
    });
  },
};

export default withStandardDecorators(tool);
