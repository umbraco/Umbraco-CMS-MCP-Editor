import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { isHostedRuntime } from "../../helpers/runtime.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the content page to read notification subscriptions for"),
};

const subscriptionSchema = z.object({
  actionId: z.string().describe("Internal action identifier used when updating subscriptions"),
  alias: z.string().describe("Human-readable action alias (e.g. publish, unpublish, save, delete)"),
  subscribed: z.boolean().describe("True if the current user is subscribed to this action"),
});

const outputSchema = z.object({
  id: z.string(),
  subscriptions: z.array(subscriptionSchema),
  subscribedActionIds: z.array(z.string()).describe("Convenience list of actionIds the current user is already subscribed to — pass back into set-content-notifications to preserve or modify"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-content-notifications",
  description: "Get the current OAuth user's email notification subscriptions for a content page. Returns the full list of available actions (publish, unpublish, save, delete, etc.) with the user's subscribed/unsubscribed state for each. Hosted-only — not available in stdio mode because the static API user has no real inbox.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  enabled: isHostedRuntime,
  handler: async ({ id }) => {
    const result = await chainCms("get-document-notifications", { id });
    if (!result.ok) return result.errorResult;

    const subscriptions = result.data.items.map((item) => ({
      actionId: item.actionId,
      alias: item.alias,
      subscribed: item.subscribed,
    }));

    const subscribedActionIds = subscriptions
      .filter((s) => s.subscribed)
      .map((s) => s.actionId);

    return createToolResult({ id, subscriptions, subscribedActionIds });
  },
};

export default withStandardDecorators(tool);
