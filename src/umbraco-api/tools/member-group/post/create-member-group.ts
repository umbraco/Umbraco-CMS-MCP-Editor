import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  name: z.string().describe("The name of the new member group"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-member-group",
  description: "Create a new member group. Groups are referenced by name when assigning members via create-member or update-member. Use list-member-groups to check existing groups first.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name }) => {
    const createResult = await chainCms("create-member-group", { name });
    if (!createResult.ok) return createResult.errorResult;

    return createToolResult({
      message: `Created member group "${name}"`,
      id: createResult.data.id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
