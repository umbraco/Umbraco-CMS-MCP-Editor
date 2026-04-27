import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("UUID of the document type to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  alias: z.string(),
  name: z.string(),
  description: z.string().optional(),
  variesByCulture: z.boolean().optional(),
  variesBySegment: z.boolean().optional(),
  properties: z.array(z.object({
    alias: z.string(),
    name: z.string(),
    description: z.string().optional(),
    dataTypeId: z.string().optional(),
    variesByCulture: z.boolean().optional(),
    variesBySegment: z.boolean().optional(),
  })).describe("Editable property definitions for this document type — use the `alias` when calling edit-page or save-and-publish"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-document-type",
  description: "Get the full schema for a document type, including the list of editable properties (alias, name, description). Use before edit-page or save-and-publish to discover which property aliases can be set. Pair with list-document-types to find the type ID.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await chainCms("get-document-type-by-id", { id });
    if (!result.ok) return result.errorResult;
    const data = result.data;

    return createToolResult({
      id: data.id,
      alias: data.alias ?? "",
      name: data.name ?? data.alias ?? "Unknown",
      description: data.description || undefined,
      variesByCulture: data.variesByCulture || undefined,
      variesBySegment: data.variesBySegment || undefined,
      properties: (data.properties ?? []).map((p) => ({
        alias: p.alias,
        name: p.name ?? p.alias,
        description: p.description || undefined,
        dataTypeId: p.dataType?.id || undefined,
        variesByCulture: p.variesByCulture || undefined,
        variesBySegment: p.variesBySegment || undefined,
      })),
    });
  },
};

export default withStandardDecorators(tool);
