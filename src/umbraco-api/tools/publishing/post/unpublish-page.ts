import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";
import { getServerRef } from "../../../server-ref.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to unpublish"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "unpublish-page",
  description: "Unpublish a content page, removing it from the live website. The page will still exist as a draft. You will be asked to confirm before unpublishing.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    const server = getServerRef();
    const elicitResult = await server.elicitInput(
      {
        message: `Unpublish "${pageName}"? This will remove it from the live website. The page will still exist as a draft.`,
        requestedSchema: {
          type: "object" as const,
          properties: {
            confirm: {
              type: "boolean" as const,
              title: "Confirm unpublish",
              description: `Remove "${pageName}" from the live site`,
              default: false,
            },
          },
        },
      },
      { relatedRequestId: extra?.requestId },
    );

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Unpublish cancelled", id, name: pageName });
    }

    // Pass cultures: null for invariant content ([] is rejected by the API)
    const cultures = (doc.variants ?? [])
      .filter((v: any) => v.culture)
      .map((v: any) => v.culture);
    const result = await mcpClientManager.callTool("cms", "unpublish-document", {
      id,
      data: { cultures: cultures.length > 0 ? cultures : null },
    });
    if (result.isError) return createToolResultError(result);

    return createToolResult({ message: `Unpublished "${pageName}" — it is now a draft only`, id, name: pageName });
  },
};

export default withStandardDecorators(tool);
