import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";
import { getServerRef } from "../../../server-ref.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to publish"),
  includeDescendants: z.boolean().optional().default(false).describe("Whether to also publish all child pages"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "publish-page",
  description: "Publish a content page to make it live on the website. Optionally publish all child pages too. You will be asked to confirm before publishing.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, includeDescendants }) => {
    // Step 1: Fetch page details for confirmation
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation via server
    const confirmMessage = includeDescendants
      ? `Publish "${pageName}" and all its child pages to the live site?`
      : `Publish "${pageName}" to the live site?`;

    const server = getServerRef();
    const elicitResult = await server.elicitInput({
      message: confirmMessage,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm publish",
            description: confirmMessage,
            default: true,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Publish cancelled", id, name: pageName });
    }

    // Step 3: Execute publish
    const publishArgs: Record<string, unknown> = { id, data: { publishSchedules: [] } };
    const toolName = includeDescendants ? "publish-document-with-descendants" : "publish-document";
    const publishResult = await mcpClientManager.callTool("cms", toolName, publishArgs);
    if (publishResult.isError) return createToolResultError(publishResult);

    return createToolResult({
      message: includeDescendants ? `Published "${pageName}" and all child pages` : `Published "${pageName}"`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
