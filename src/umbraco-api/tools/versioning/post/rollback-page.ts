import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition , extractChainedResult, confirmAction, getServerRef } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";



const inputSchema = {
  id: z.string().uuid().describe("The page ID to rollback"),
  versionId: z.string().uuid().describe("The version ID to rollback to (from list-versions)"),
  culture: z.string().optional().describe("Optional culture code for variant-specific rollback (e.g. 'en-US')"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  versionId: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "rollback-page",
  description: "Rollback a content page to a previous version. This replaces the current draft with the selected version. The published version is not affected until you publish again.",
  inputSchema,
  outputSchema,
  slices: ["update", "version"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id, versionId, culture }, extra) => {
    // Step 1: Fetch page details for human-readable confirmation
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 1b: Validate the version belongs to this page
    const pageSize = 100;
    const versionsResult = await mcpClientManager.callTool("cms", "get-document-version", {
      documentId: id, skip: 0, take: pageSize,
    });
    if (!versionsResult.isError) {
      const versionsData = extractChainedResult(versionsResult);
      const items = versionsData.items ?? [];
      const versionIds = items.map((v: any) => v.id ?? v.versionId);
      // Only reject if we fetched all versions (items < pageSize) and the ID wasn't found.
      // If we got a full page, the version may exist beyond what we fetched — skip the check.
      if (items.length < pageSize && versionIds.length > 0 && !versionIds.includes(versionId)) {
        return createToolResultError({
          message: `Version ${versionId} does not belong to page "${pageName}" (${id}). Use list-versions to find valid version IDs for this page.`,
        });
      }
    }

    // Step 2: Elicit confirmation (destructive action, default false)
    const confirmMessage = `Rollback "${pageName}" to a previous version? This replaces the current draft. The published version is not affected until you publish again.`;

    const server = getServerRef();
    const elicitResult = await server.elicitInput(
      {
        message: confirmMessage,
        requestedSchema: {
          type: "object" as const,
          properties: {
            confirm: {
              type: "boolean" as const,
              title: "Confirm rollback",
              description: confirmMessage,
              default: false,
            },
          },
        },
      },
      { relatedRequestId: extra?.requestId },
    );

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Rollback cancelled", id, name: pageName, versionId });
    }

    // Step 3: Execute rollback
    const rollbackArgs: Record<string, unknown> = { id: versionId };
    if (culture) {
      rollbackArgs.culture = culture;
    }

    const rollbackResult = await mcpClientManager.callTool("cms", "create-document-version-rollback", rollbackArgs);
    if (rollbackResult.isError) return createToolResultError(rollbackResult);

    return createToolResult({
      message: `Rolled back "${pageName}" to a previous version. The draft has been updated. Publish the page to make this version live.`,
      id,
      name: pageName,
      versionId,
    });
  },
};

export default withStandardDecorators(tool);
