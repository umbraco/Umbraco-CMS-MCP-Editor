import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the blueprint to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentType: z.object({
    id: z.string().optional(),
    alias: z.string().optional(),
    name: z.string().optional(),
  }).optional().describe("The document type this blueprint is based on"),
  values: z.array(z.object({
    alias: z.string(),
    value: z.any(),
    culture: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
  })).optional().describe("Pre-filled property values"),
  variants: z.array(z.object({
    name: z.string().optional(),
    culture: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
  })).optional().describe("Variant information"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-blueprint",
  description: "Get the full details of a page blueprint including its pre-filled property values. Blueprints are page templates that provide default content when creating new pages.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-blueprint", { id });
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    const documentType = data.documentType
      ? {
          id: data.documentType.id ?? undefined,
          alias: data.documentType.alias ?? undefined,
          name: data.documentType.name ?? undefined,
        }
      : undefined;

    const name =
      data.name ??
      data.variants?.[0]?.name ??
      "Unknown";

    return createToolResult({
      id: data.id,
      name,
      documentType,
      values: data.values ?? [],
      variants: (data.variants ?? []).map((v: any) => ({
        name: v.name ?? undefined,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
      })),
    });
  },
};

export default withStandardDecorators(tool);
