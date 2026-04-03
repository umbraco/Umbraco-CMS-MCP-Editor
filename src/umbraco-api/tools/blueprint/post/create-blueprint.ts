import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  pageId: z.string().uuid().describe("The ID of the source page to save as a blueprint"),
  name: z.string().describe("The name for the new blueprint"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-blueprint",
  description: "Save an existing page as a reusable blueprint (template). The blueprint preserves the page's document type and property values. You will be asked to confirm before creating.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ pageId, name }, extra) => {
    // Resolve source page name for human-readable confirmation
    let pageName = pageId;
    const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
    if (!pageResult.isError) {
      const page = extractChainedResult(pageResult);
      pageName = page?.variants?.[0]?.name ?? page?.name ?? pageId;
    }

    // Elicit confirmation
    if (!await confirmAction(extra, `Save "${pageName}" as blueprint "${name}"?`, { title: "Confirm create blueprint" })) {
      return createToolResult({ message: "Create blueprint cancelled", id: "", name });
    }

    // Execute create via dev MCP
    const createResult = await mcpClientManager.callTool("cms", "create-document-blueprint-from-document", {
      document: { id: pageId },
      name,
    });
    if (createResult.isError) return createToolResultError(createResult);

    const created = extractChainedResult(createResult);
    const createdId = created?.id ?? "";

    return createToolResult({
      message: `Created blueprint "${name}" from page "${pageName}"`,
      id: createdId,
      name,
    });
  },
};

export default withStandardDecorators(tool);
