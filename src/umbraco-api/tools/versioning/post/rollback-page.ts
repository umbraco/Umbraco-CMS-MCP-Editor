import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { getServerRef } from "../../../server-ref.js";

const inputSchema = {
  versionId: z.string().uuid().describe("The version ID to rollback to (from list-versions)"),
  culture: z.string().optional().describe("Optional culture code for variant-specific rollback (e.g. 'en-US')"),
};

const outputSchema = z.object({
  message: z.string(),
  versionId: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "rollback-page",
  description: "Rollback a content page to a previous version. This replaces the current draft with the selected version. The published version is not affected until you publish again.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ versionId, culture }) => {
    // Step 1: Elicit confirmation (destructive action, default false)
    const confirmMessage = `Rollback to version ${versionId}? This replaces the current draft. The published version is not affected until you publish again.`;

    const server = getServerRef();
    const elicitResult = await server.elicitInput({
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
    });

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Rollback cancelled", versionId });
    }

    // Step 2: Execute rollback
    const rollbackArgs: Record<string, unknown> = { id: versionId };
    if (culture) {
      rollbackArgs.culture = culture;
    }

    const rollbackResult = await mcpClientManager.callTool("cms", "create-document-version-rollback", rollbackArgs);
    if (rollbackResult.isError) return createToolResultError(rollbackResult);

    return createToolResult({
      message: `Rolled back to version ${versionId}. The draft has been updated. Publish the page to make this version live.`,
      versionId,
    });
  },
};

export default withStandardDecorators(tool);
