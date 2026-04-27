import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
    const result = await chainCms("get-member", { id });
    if (!result.ok) return result.errorResult;
    const data = result.data;
    return createToolResult({
      id: data.id ?? id,
      name: data.variants?.[0]?.name ?? "Unknown",
      email: data.email ?? "",
      username: data.username ?? "",
      memberType: (data.memberType as { alias?: string })?.alias ?? "",
      isApproved: data.isApproved ?? false,
      isLockedOut: data.isLockedOut ?? false,
      isTwoFactorEnabled: data.isTwoFactorEnabled ?? false,
      groups: data.groups ?? [],
      values: (data.values ?? []).map((v) => ({ alias: v.alias, value: v.value })),
      lastLoginDate: data.lastLoginDate ?? null,
      lastPasswordChangeDate: data.lastPasswordChangeDate ?? null,
    });
  },
};

export default withStandardDecorators(tool);
