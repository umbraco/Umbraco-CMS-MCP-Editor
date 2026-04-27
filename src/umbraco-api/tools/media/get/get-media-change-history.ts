import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the media item to get change history for"),
  skip: z.number().int().min(0).optional().default(0).describe("Number of entries to skip (for pagination)"),
  take: z.number().int().min(1).max(100).optional().default(20).describe("Number of entries to return"),
};

const outputSchema = z.object({
  name: z.string(),
  entries: z.array(z.object({
    user: z.string().describe("Name of the user who performed the action (falls back to user ID if the name cannot be resolved)"),
    timestamp: z.string().describe("ISO timestamp of when the action occurred"),
    action: z.string().describe("Action type (e.g. Save, Delete, Move)"),
    description: z.string().describe("Human-readable description of the action, if any"),
  })),
  total: z.number(),
});

async function resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds));
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const userResult = await chainCms("get-user-by-id", { id });
        if (!userResult.ok) return [id, id] as const;
        return [id, userResult.data.name ?? id] as const;
      } catch {
        return [id, id] as const;
      }
    }),
  );
  return new Map(results);
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-media-change-history",
  description: "List the audit log (\"History\" on the Info tab) for a media item — who did what to this file and when. Useful for answering \"who replaced the hero image?\".",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, skip, take }) => {
    const mediaResult = await chainCms("get-media-by-id", { id });
    if (!mediaResult.ok) return mediaResult.errorResult;
    const name = mediaResult.data.variants?.[0]?.name ?? "Unknown";

    const auditResult = await chainCms("get-media-audit-log", {
      id,
      cursor: encodeCursor({ s: skip, t: take }),
    });
    if (!auditResult.ok) return auditResult.errorResult;

    const items = auditResult.data.items;
    const userIds = items.map((entry) => entry.user.id).filter((uid): uid is string => typeof uid === "string");
    const userNames = await resolveUserNames(userIds);

    const entries = items.map((entry) => ({
      user: userNames.get(entry.user.id) ?? entry.user.id ?? "Unknown",
      timestamp: entry.timestamp,
      action: entry.logType,
      description: entry.comment ?? "",
    }));

    return createToolResult({
      name,
      entries,
      total: auditResult.data.total,
    });
  },
};

export default withStandardDecorators(tool);
