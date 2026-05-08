import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the redirect to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  originalUrl: z.string(),
  destinationUrl: z.string(),
  destinationType: z.string(),
  isAutomatic: z.boolean(),
  createDate: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-redirect",
  description: "View the full details of a URL redirect including when it was created and whether it was automatic. Use list-redirects to find redirect IDs.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await chainCms("get-redirect-by-id", { id });
    if (!result.ok) return result.errorResult;
    // The dev MCP types this as { items: [...] } but the runtime response is the
    // single redirect at the top level. Narrow at this single boundary.
    const data = result.data as {
      id?: string;
      originalUrl?: string;
      url?: string;
      destinationUrl?: string;
      destinationPath?: string;
      destinationType?: string;
      isAutomatic?: boolean;
      createDate?: string;
      createdAt?: string;
    };

    return createToolResult({
      id: data.id ?? id,
      originalUrl: data.originalUrl ?? data.url ?? "",
      destinationUrl: data.destinationUrl ?? data.destinationPath ?? "",
      destinationType: data.destinationType ?? "other",
      isAutomatic: data.isAutomatic ?? false,
      createDate: data.createDate ?? data.createdAt ?? "",
    });
  },
};

export default withStandardDecorators(tool);
