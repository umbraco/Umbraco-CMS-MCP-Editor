import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to edit"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The new property value"),
    culture: z.string().nullable().optional().describe("The culture code for variant content"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
  })).describe("Property values to update on the page"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  updatedFields: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-page",
  description: "Update specific fields on a content page. Changes are saved but NOT published. Call get-page first to discover valid property aliases for the page's document type.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, values }) => {
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";
    const fieldNames = values.map((v) => v.alias);

    const updateResult = await mcpClientManager.callTool("cms", "update-document-properties", {
      id,
      properties: values.map(v => ({
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
      })),
    });
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) on "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      updatedFields: fieldNames,
    });
  },
};

export default withStandardDecorators(tool);
