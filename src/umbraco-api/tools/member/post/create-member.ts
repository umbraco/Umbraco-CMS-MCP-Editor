import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  email: z.string().email().describe("The email address for the new member"),
  username: z.string().describe("The username for the new member"),
  name: z.string().describe("The display name for the new member"),
  password: z.string().describe("The initial password for the new member"),
  memberTypeId: z.string().uuid().describe("The ID of the member type. Call list-member-types first to find a valid ID."),
  groups: z.array(z.string()).optional().describe("Member group names to assign (use names from list-member-groups, e.g. 'Premium Members')"),
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
  description: "Create a new member account. Call list-member-types to find a valid member type ID and list-member-groups to see available groups. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ email, username, name, password, memberTypeId, groups, values }, extra) => {
    // Elicit confirmation
    if (!await confirmAction(extra, `Create member "${name}" (${email})?`, { title: "Confirm create member" })) {
      return createToolResult({ message: "Create cancelled", id: "", name, email });
    }

    // Delegate to CMS MCP
    const createArgs: Record<string, unknown> = {
      email,
      username,
      name,
      password,
      memberType: { id: memberTypeId },
    };
    if (groups !== undefined) createArgs.groups = groups;
    if (values !== undefined) createArgs.values = values;

    const createResult = await mcpClientManager.callTool("cms", "create-member", createArgs);
    if (createResult.isError) return createToolResultError(createResult);

    const created = extractChainedResult(createResult);
    const createdId = created?.id ?? "";

    return createToolResult({
      message: `Created member "${name}" (${email})`,
      id: createdId,
      name,
      email,
    });
  },
};

export default withStandardDecorators(tool);
