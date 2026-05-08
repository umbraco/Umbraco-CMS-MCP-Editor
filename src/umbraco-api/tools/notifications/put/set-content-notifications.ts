import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { isHostedRuntime } from "../../helpers/runtime.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the content page to update notification subscriptions for"),
  subscribedActionIds: z.array(z.string()).describe("Complete list of action IDs the current user should be subscribed to. Replaces existing subscriptions — pass an empty array to unsubscribe from all. Call get-content-notifications first to see available actionIds and preserve any you don't want to change."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  subscribedActionIds: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "set-content-notifications",
  description: "Replace the current OAuth user's email notification subscriptions for a content page. Full overwrite — any action ID not in the list will be unsubscribed. Hosted-only — not available in stdio mode because the static API user has no real inbox.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  enabled: isHostedRuntime,
  handler: async ({ id, subscribedActionIds }) => {
    const result = await chainCms("put-document-notifications", {
      id,
      data: { subscribedActionIds },
    });
    if (!result.ok) return result.errorResult;

    const count = subscribedActionIds.length;
    return createToolResult({
      message: count === 0
        ? "Unsubscribed from all notifications for this page"
        : `Subscribed to ${count} notification action${count === 1 ? "" : "s"} for this page`,
      id,
      subscribedActionIds,
    });
  },
};

export default withStandardDecorators(tool);
