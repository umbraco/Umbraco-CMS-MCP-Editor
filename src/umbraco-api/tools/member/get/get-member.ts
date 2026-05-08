import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { hasSensitiveDataAccess } from "../sensitive-data-access.js";
import { memberTypeToString } from "../../member-reporting/get/member-type-helper.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the member to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  username: z.string(),
  memberType: z.string(),
  // The fields below are gated by Umbraco's "Sensitive Data" user group. When
  // the API user that the editor MCP authenticates as is NOT in that group,
  // Umbraco masks these in every response (forced to false/null) — so we
  // return null here rather than a misleading `false`. To get real values,
  // add the API user to the Sensitive Data group in the Umbraco backoffice.
  isApproved: z.boolean().nullable(),
  isLockedOut: z.boolean().nullable(),
  isTwoFactorEnabled: z.boolean().nullable(),
  groups: z.array(z.string()),
  values: z.array(z.object({ alias: z.string(), value: z.any() })),
  lastLoginDate: z.string().nullable(),
  lastPasswordChangeDate: z.string().nullable(),
  sensitiveDataAccessible: z.boolean().describe("Whether the calling API user can see real values for isApproved / isLockedOut / isTwoFactorEnabled / lastLoginDate. False means those fields are null in this response — grant Sensitive Data group access to the API user to see them."),
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
    const accessible = await hasSensitiveDataAccess();

    return createToolResult({
      id: data.id ?? id,
      name: data.variants?.[0]?.name ?? "Unknown",
      email: data.email ?? "",
      username: data.username ?? "",
      memberType: memberTypeToString(data.memberType),
      isApproved: accessible ? (data.isApproved ?? false) : null,
      isLockedOut: accessible ? (data.isLockedOut ?? false) : null,
      isTwoFactorEnabled: accessible ? (data.isTwoFactorEnabled ?? false) : null,
      groups: data.groups ?? [],
      values: (data.values ?? []).map((v) => ({ alias: v.alias, value: v.value })),
      lastLoginDate: accessible ? (data.lastLoginDate ?? null) : null,
      lastPasswordChangeDate: data.lastPasswordChangeDate ?? null,
      sensitiveDataAccessible: accessible,
    });
  },
};

export default withStandardDecorators(tool);
