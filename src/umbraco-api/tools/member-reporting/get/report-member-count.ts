import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { memberTypeToString } from "./member-type-helper.js";

const inputSchema = {};

const outputSchema = z.object({
  totalMembers: z.number().describe("Total number of members across all types and groups (exact, server-reported — not capped by the sample)."),
  byType: z.array(z.object({
    memberType: z.string().describe("Member type alias or name"),
    count: z.number(),
  })).describe("Member counts grouped by member type, computed from a sample of up to 500 members — may undercount byType on larger sites (byType counts can sum to less than totalMembers). Maps naturally to a pie or bar chart."),
  byGroup: z.array(z.object({
    group: z.string().describe("Member group name"),
    count: z.number(),
  })).describe("Member counts grouped by member group — exact, server-reported per-group totals (uncapped). Members with no group are excluded."),
});

const PAGE_SIZE = 100;
const MEMBER_CAP = 500;

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-member-count",
  description: "Returns a breakdown of member counts by type and group. totalMembers and the byGroup counts are exact (server-reported, uncapped); the byType breakdown is computed from a sample of up to 500 members, so it may undercount on larger sites. Data maps naturally to pie or bar charts.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async () => {
    // Fetch a sample of members (capped at MEMBER_CAP) for the by-type breakdown,
    // and capture the server-reported grand total from the first page so
    // totalMembers is exact even when the sample is capped.
    const sampledMembers: any[] = [];
    let totalMembers = 0;
    let cursor: string | undefined = encodeCursor({ s: 0, t: PAGE_SIZE });

    while (sampledMembers.length < MEMBER_CAP) {
      const result = await chainCms("find-member", { cursor: cursor as string | undefined, orderBy: "username" });
      if (!result.ok) return result.errorResult;
      const data: any = result.data;
      const items: any[] = data.items ?? [];
      if (typeof data.total === "number") totalMembers = data.total;
      sampledMembers.push(...items);
      const nextCursor: string | null | undefined = data.nextCursor;
      if (!nextCursor || items.length === 0) break;
      cursor = nextCursor;
    }
    // If the server never reported a total, fall back to what we sampled.
    if (totalMembers === 0 && sampledMembers.length > 0) totalMembers = sampledMembers.length;

    // Group by member type (from the sample — capped at MEMBER_CAP).
    const typeCounts = new Map<string, number>();
    for (const member of sampledMembers) {
      const memberType = memberTypeToString(member.memberType);
      typeCounts.set(memberType, (typeCounts.get(memberType) ?? 0) + 1);
    }

    // Fetch all member groups.
    const groupResult = await chainCms("get-all-member-groups", {});
    if (!groupResult.ok) return groupResult.errorResult;
    const allGroups: any[] = groupResult.data.items ?? [];

    // Count members per group. Since Umbraco 18 the member search/collection
    // response returns `groups: []` on every item (membership is only on the
    // per-member detail GET), so we can't tally `member.groups` from the sample.
    // Instead ask the server for each group's own count via the `memberGroupName`
    // filter (verified to filter server-side) and read the reported total — this
    // is accurate and uncapped. Run the per-group queries concurrently. Because
    // the group counts are server totals (uncapped), totalMembers above is also a
    // server total (uncapped), so a group count can never exceed the reported total.
    const named = allGroups.filter((g: any) => typeof g.name === "string");
    const perGroupResults = await Promise.all(
      named.map((g: any) =>
        chainCms("find-member", {
          memberGroupName: g.name,
          cursor: encodeCursor({ s: 0, t: 1 }),
          orderBy: "username",
        }),
      ),
    );
    const byGroup: { group: string; count: number }[] = [];
    for (let i = 0; i < named.length; i++) {
      const r = perGroupResults[i];
      if (!r.ok) return r.errorResult;
      // Trust the server total; take=1 makes items.length an unreliable fallback,
      // so fall back to 0 (unknown) rather than a misleading 1.
      byGroup.push({ group: named[i].name, count: (r.data as any).total ?? 0 });
    }

    return createToolResult({
      totalMembers,
      byType: Array.from(typeCounts.entries())
        .map(([memberType, count]) => ({ memberType, count }))
        .sort((a, b) => b.count - a.count),
      byGroup: byGroup.sort((a, b) => b.count - a.count),
    });
  },
};

export default withStandardDecorators(tool);
