import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";
import { hasSensitiveDataAccess } from "../sensitive-data-access.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the member to update"),
  name: z.string().optional().describe("The new display name for the member"),
  email: z.string().email().optional().describe("The new email address for the member"),
  username: z.string().optional().describe("New username. Changing the username affects how the member signs in — verify with the user before using this."),
  newPassword: z.string().min(1).optional().describe("Set a new password for the member. This is a sensitive operation and will ask for a separate confirmation before applying; the old password will no longer work once changed."),
  isTwoFactorEnabled: z.boolean().optional().describe("Whether two-factor authentication is enabled for this member"),
  isApproved: z.boolean().optional().describe("Whether the member account is approved"),
  isLockedOut: z.boolean().optional().describe("Whether the member account is locked out"),
  groups: z.array(z.string().uuid()).optional().describe("Member group IDs to assign — replaces existing groups (use list-member-groups to find IDs)"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The new property value"),
  })).optional().describe("Custom property values to update"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "update-member",
  description: "Update a member's profile, credentials (username / password / 2FA toggle), approval status, groups, or custom properties. Call get-member first to see current values. Password resets require an extra confirmation.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, name, email, username, newPassword, isTwoFactorEnabled, isApproved, isLockedOut, groups, values }, extra) => {
    // Sensitive Data gate — see sensitive-data-access.ts. Umbraco silently
    // reverts isApproved/isLockedOut on update when the API user isn't in the
    // Sensitive Data group. Surface an explicit error rather than letting the
    // caller think the field landed.
    if ((isApproved !== undefined || isLockedOut !== undefined || isTwoFactorEnabled !== undefined)
        && !(await hasSensitiveDataAccess())) {
      return createToolResultError({
        status: 403,
        title: "Sensitive Data access required",
        detail: "Updating isApproved, isLockedOut, or isTwoFactorEnabled requires the API user to be in Umbraco's built-in Sensitive Data user group (group key 8C6AD70F-D307-4E4A-AF58-72C2E4E9439D). Add the API user to that group in the Umbraco backoffice (Settings → Users → API Users → groups), then retry. Other update-member fields (name, email, username, groups, values, newPassword) are not affected.",
      });
    }

    const memberResult = await chainCms("get-member", { id });
    if (!memberResult.ok) return memberResult.errorResult;
    const member = memberResult.data;
    const memberName = member.variants?.[0]?.name ?? name ?? "Unknown";
    const memberEmail = member.email ?? email ?? "";

    const existingUsername = member.username ?? "";
    const existingEmail = member.email ?? memberEmail;
    const existingVariants = member.variants ?? [];
    const existingValues = member.values ?? [];

    type UpdateMemberData = Parameters<typeof chainCms<"update-member">>[1]["data"];
    const data: UpdateMemberData = {
      username: username ?? existingUsername,
      email: email ?? existingEmail,
      isApproved: isApproved ?? member.isApproved ?? true,
      isLockedOut: isLockedOut ?? member.isLockedOut ?? false,
      isTwoFactorEnabled: isTwoFactorEnabled ?? member.isTwoFactorEnabled ?? false,
      variants: name !== undefined
        ? [{ culture: null, segment: null, name }]
        : existingVariants,
      values: values ?? existingValues,
    };
    if (groups !== undefined) data.groups = groups;

    let passwordChanged = false;
    if (newPassword !== undefined) {
      const passwordConfirmed = await confirmStep(
        extra,
        `Reset the password for "${memberName}" (${memberEmail})? The old password will no longer work — make sure the member knows their new password.`,
      );
      if (passwordConfirmed) {
        data.newPassword = newPassword;
        passwordChanged = true;
      }
    }

    const updateResult = await chainCms("update-member", { id, data });
    if (!updateResult.ok) return updateResult.errorResult;

    const passwordSuffix = newPassword !== undefined
      ? passwordChanged ? " (password changed)" : " (password reset cancelled)"
      : "";

    return createToolResult({
      message: `Updated member "${memberName}"${passwordSuffix}`,
      id,
      name: name ?? memberName,
      email: email ?? memberEmail,
    });
  },
};

export default withStandardDecorators(tool);
