import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {};

const outputSchema = z.object({
  isEnabled: z.boolean(),
  message: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-redirect-status",
  description: "Check whether automatic URL redirect tracking is enabled on the site. When enabled, Umbraco automatically creates redirects when pages are moved or renamed.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async () => {
    const result = await chainCms("get-redirect-status", {});
    if (!result.ok) return result.errorResult;
    const isEnabled = result.data.status === "Enabled";
    return createToolResult({
      isEnabled,
      message: isEnabled
        ? "URL redirect tracking is enabled"
        : "URL redirect tracking is disabled",
    });
  },
};

export default withStandardDecorators(tool);
