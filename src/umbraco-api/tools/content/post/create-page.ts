import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  name: z.string().describe("The name of the page to create"),
  documentTypeId: z.string().uuid().describe("The ID of the document type to use. Call list-document-types first to find available types."),
  parentId: z.string().uuid().optional().describe("The ID of the parent page. If omitted, the page is created at the root"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The property value"),
    culture: z.string().nullable().optional().describe("The culture code for variant content"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
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
  handler: async ({ name, documentTypeId, parentId, values }, extra) => {
    const fieldCount = values?.length ?? 0;

    // Resolve parent name for human-readable confirmation
    let location = "at the root";
    if (parentId) {
      const parentResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: parentId });
      if (!parentResult.isError) {
        const parent = extractChainedResult(parentResult);
        const parentName = parent?.variants?.[0]?.name ?? parent?.name ?? parentId;
        location = `under "${parentName}"`;
      } else {
        location = `under parent ${parentId}`;
      }
    }

    // Elicit confirmation
    const confirmMessage = `Create page "${name}" ${location} with ${fieldCount} field(s)? The page will be saved as a draft (not published).`;

    if (!await confirmAction(extra, confirmMessage, { title: "Confirm create", defaultValue: true })) {
      return createToolResult({ message: "Create cancelled", id: "", name });
    }

    // Execute create via dev MCP
    const createArgs: Record<string, unknown> = {
      documentTypeId,
      name,
      values: (values ?? []).map(v => ({
        alias: v.alias,
        value: v.value,
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
