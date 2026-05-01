import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  email: z.string().email().describe("The email address for the new member"),
  username: z.string().describe("The username for the new member"),
  name: z.string().describe("The display name for the new member"),
  password: z.string().describe("The initial password for the new member"),
  memberTypeId: z.string().uuid().describe("The ID of the member type. Call list-member-types first to find a valid ID."),
  isApproved: z.boolean().optional().default(true).describe("Whether the member account is approved immediately (default true)"),
  groups: z.array(z.string().uuid()).optional().describe("Member group IDs to assign. Use list-member-groups to find group IDs."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The property value"),
  })).optional().describe("Custom property values to set on the new member"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-member",
  description: "Create a new member account. Use update-member to change details on an existing member — search-members first if unsure whether the email or username is already taken. Call list-member-types to find a valid memberTypeId and list-member-groups for group IDs.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ email, username, name, password, memberTypeId, isApproved, groups, values }) => {
    const effectiveIsApproved = isApproved ?? true;
    // Note: when the API user isn't in Umbraco's Sensitive Data group, the
    // chained create silently reverts isApproved to false. That's no worse
    // than what Umbraco would default to, so we don't gate the create —
    // get-member will return null for isApproved in that case to make the
    // missing access visible to callers.

    const result = await chainCms("create-member", {
      email,
      username,
      password,
      memberType: { id: memberTypeId },
      isApproved: effectiveIsApproved,
      variants: [{ culture: null, segment: null, name }],
      values: (values ?? []).map(v => ({
        alias: v.alias,
        value: v.value,
        culture: null,
        segment: null,
      })),
      groups: groups ?? null,
    });

    if (!result.ok) return result.errorResult;
    const memberId = result.data.id;

    // Workaround for a chained CMS quirk: `create-member` accepts `groups` in
    // its input schema but doesn't actually persist them — the new member
    // lands with groups=[]. Apply via an immediate `update-member` call so
    // the resulting state matches the editor's intent.
    //
    // NOTE about `isApproved`: this field is gated by Umbraco's "Sensitive
    // Data" user group (built-in group key 8C6AD70F-D307-4E4A-AF58-72C2E4E9439D).
    //   - Write side: MemberEditingService.UpdateAsync silently reverts an
    //     incoming `IsApproved` to the existing value when the calling user
    //     isn't in the Sensitive Data group.
    //   - Read side: MemberPresentationFactory.RemoveSensitiveDataAsync forces
    //     `IsApproved` to false in every response for the same group of users.
    // So unless the API user that the editor MCP authenticates as is added to
    // the Sensitive Data group in the Umbraco backoffice (Users → API Users
    // → Groups), `isApproved` here cannot be set or read back correctly. The
    // input schema field is preserved for forward-compat — once the API user
    // has the right group, both paths work end-to-end.
    if (groups && groups.length > 0) {
      const docResult = await chainCms("get-member", { id: memberId });
      if (docResult.ok) {
        const member = docResult.data;
        await chainCms("update-member", {
          id: memberId,
          data: {
            email: member.email ?? email,
            username: member.username ?? username,
            isApproved: member.isApproved ?? effectiveIsApproved,
            isLockedOut: member.isLockedOut ?? false,
            isTwoFactorEnabled: member.isTwoFactorEnabled ?? false,
            variants: member.variants ?? [{ culture: null, segment: null, name }],
            values: (member.values ?? []).map(v => ({
              alias: v.alias,
              value: v.value,
              culture: v.culture ?? null,
              segment: v.segment ?? null,
            })),
            groups,
          },
        });
      }
    }

    return createToolResult({
      message: `Created member "${name}" (${email})`,
      id: memberId,
      name,
      email,
    });
  },
};

export default withStandardDecorators(tool);
