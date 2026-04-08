import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the member to update"),
  name: z.string().optional().describe("The new display name for the member"),
  email: z.string().email().optional().describe("The new email address for the member"),
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
  description: "Update a member's profile, approval status, groups, or custom properties. Call get-member first to see current values. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, name, email, isApproved, isLockedOut, groups, values }, extra) => {
    // Step 1: Fetch member details for confirmation
    const memberResult = await mcpClientManager.callTool("cms", "get-member", { id });
    if (memberResult.isError) return createToolResultError(memberResult);
    const member = extractChainedResult(memberResult);
    const memberName = member.variants?.[0]?.name ?? member.name ?? name ?? "Unknown";
    const memberEmail = member.email ?? email ?? "";

    // Step 2: Elicit confirmation
    if (!await confirmAction(extra, `Update member "${memberName}" (${memberEmail})?`, { title: "Confirm update member" })) {
      return createToolResult({ message: "Update cancelled", id, name: memberName, email: memberEmail });
    }

    // Step 3: Delegate to CMS MCP
    const updateArgs: Record<string, unknown> = { id };
    if (name !== undefined) updateArgs.name = name;
    if (email !== undefined) updateArgs.email = email;
    if (isApproved !== undefined) updateArgs.isApproved = isApproved;
    if (isLockedOut !== undefined) updateArgs.isLockedOut = isLockedOut;
    if (groups !== undefined) updateArgs.groups = groups;
    if (values !== undefined) updateArgs.values = values;

    const updateResult = await mcpClientManager.callTool("cms", "update-member", updateArgs);
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Updated member "${memberName}"`,
      id,
      name: name ?? memberName,
      email: email ?? memberEmail,
    });
  },
};

export default withStandardDecorators(tool);
