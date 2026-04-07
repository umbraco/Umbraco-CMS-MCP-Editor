import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the member to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string(),
  memberType: z.string(),
  isApproved: z.boolean(),
  isLockedOut: z.boolean(),
  isTwoFactorEnabled: z.boolean(),
  groups: z.array(z.string()),
  values: z.array(z.object({ alias: z.string(), value: z.any() })),
  lastLoginDate: z.string().nullable(),
  lastPasswordChangeDate: z.string().nullable(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-member",
  description: "Get the full profile of a member including their groups, properties, approval status, and login history.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-member", { id });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    return createToolResult({
      id: data.id ?? id,
      name: data.variants?.[0]?.name ?? data.name ?? "Unknown",
      email: data.email ?? "",
      username: data.username ?? "",
      memberType: data.memberType?.alias ?? data.memberType ?? "",
      isApproved: data.isApproved ?? false,
      isLockedOut: data.isLockedOut ?? false,
      isTwoFactorEnabled: data.isTwoFactorEnabled ?? false,
      groups: data.groups ?? [],
      values: (data.values ?? []).map((v: any) => ({ alias: v.alias, value: v.value })),
      lastLoginDate: data.lastLoginDate ?? null,
      lastPasswordChangeDate: data.lastPasswordChangeDate ?? null,
    });
  },
};

export default withStandardDecorators(tool);
