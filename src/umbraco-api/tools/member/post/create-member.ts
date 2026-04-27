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
  description: "Create a new member account. Call list-member-types to find a valid member type ID and list-member-groups to find group IDs.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ email, username, name, password, memberTypeId, isApproved, groups, values }) => {
    const result = await chainCms("create-member", {
      email,
      username,
      password,
      memberType: { id: memberTypeId },
      isApproved: isApproved ?? true,
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

    return createToolResult({
      message: `Created member "${name}" (${email})`,
      id: result.data.id,
      name,
      email,
    });
  },
};

export default withStandardDecorators(tool);
