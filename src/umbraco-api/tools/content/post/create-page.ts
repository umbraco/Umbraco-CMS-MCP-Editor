import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";
import { getServerRef } from "../../../server-ref.js";

const inputSchema = {
  name: z.string().describe("The name of the page to create"),
  documentTypeId: z.string().uuid().describe("The ID of the document type to use"),
  parentId: z.string().uuid().optional().describe("The ID of the parent page. If omitted, the page is created at the root"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The property value"),
    culture: z.string().optional().describe("The culture code for variant content"),
    segment: z.string().optional().describe("The segment for segmented content"),
  })).optional().describe("Property values to set on the new page"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-page",
  description: "Create a new content page as a draft. The page will NOT be published automatically. You will be asked to confirm before creating.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, documentTypeId, parentId, values }) => {
    const fieldCount = values?.length ?? 0;
    const location = parentId ? `under parent ${parentId}` : "at the root";

    // Elicit confirmation
    const confirmMessage = `Create page "${name}" ${location} with ${fieldCount} field(s)? The page will be saved as a draft (not published).`;

    const server = getServerRef();
    const elicitResult = await server.elicitInput({
      message: confirmMessage,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm create",
            description: confirmMessage,
            default: true,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Create cancelled", id: "", name });
    }

    // Execute create via dev MCP (flat args: documentTypeId, parentId, name, values)
    const createArgs: Record<string, unknown> = {
      documentTypeId,
      name,
      values: (values ?? []).map(v => ({
        alias: v.alias,
        value: v.value,
        editorAlias: v.alias,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
      })),
    };
    if (parentId) createArgs.parentId = parentId;

    const createResult = await mcpClientManager.callTool("cms", "create-document", createArgs);
    if (createResult.isError) return createToolResultError(createResult);

    const created = extractChainedResult(createResult);
    const createdId = created?.id ?? "";

    return createToolResult({
      message: `Created draft page "${name}"`,
      id: createdId,
      name,
    });
  },
};

export default withStandardDecorators(tool);
