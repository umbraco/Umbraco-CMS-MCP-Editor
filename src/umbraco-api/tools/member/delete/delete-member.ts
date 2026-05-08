import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the member to permanently delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-member",
  description: "Permanently delete a member. This cannot be undone — there is no recycle bin for members. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    const memberResult = await chainCms("get-member", { id });
    if (!memberResult.ok) return memberResult.errorResult;
    const name = memberResult.data.variants?.[0]?.name ?? "Unknown";
    const email = memberResult.data.email ?? "";

    const confirmMessage = `Permanently delete member "${name}" (${email})? This cannot be undone. The member and all their data will be removed.`;

    if (!await confirmStep(extra, confirmMessage)) {
      return createToolResult({ message: "Delete cancelled", id, name, email });
    }

    const deleteResult = await chainCms("delete-member", { id });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({
      message: `Permanently deleted member "${name}" (${email})`,
      id,
      name,
      email,
    });
  },
};

export default withStandardDecorators(tool);
