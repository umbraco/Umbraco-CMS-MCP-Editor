import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { extractInnerProblemDetails } from "../../../cms-chain.js";
import { resolveDocumentTypeProperties } from "../helpers/resolve-document-type-properties.js";

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
  warnings: z.array(z.string()).optional().describe("Non-fatal issues with this read — e.g. a composition that could not be loaded, whose properties are therefore missing from the list above."),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-document-type",
  description: "Get the full schema for a document type, including the list of editable properties (alias, name, description). Use before edit-page or save-and-publish to discover which property aliases can be set. Pair with list-document-types to find the type ID.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    // The doc type itself often has no direct properties — they're inherited
    // via compositions. resolveDocumentTypeProperties walks compositions and
    // merges their properties so the returned list reflects everything an
    // editor can actually set on the page. A composition that fails to load
    // (failedCompositionIds) doesn't fail this read — it's a best-effort list
    // — but it's surfaced below as a warning rather than silently skipped.
    const result = await resolveDocumentTypeProperties(id);
    if (!result.ok) {
      // A stale/typo'd id (list-document-types returned something that's
      // since been deleted, or the caller invented one) surfaces here as a
      // bare chained 404 — tell the caller what to do about it instead of
      // passing the raw ProblemDetails through. Any other status (a real
      // server error) passes through unchanged.
      const problem = extractInnerProblemDetails(result.errorResult as unknown as Record<string, unknown>);
      if (problem.status === 404) {
        return createToolResultError({
          status: 404,
          title: "Document type not found",
          detail: `No document type found with id '${id}'. Use list-document-types to find a valid id.`,
        });
      }
      return result.errorResult;
    }
    const { documentType: data, properties, failedCompositionIds, failedCompositionDetails } = result;

    const warnings = failedCompositionIds.length > 0
      ? failedCompositionIds.map((compId, i) =>
          `Composition document type '${compId}' could not be loaded (${failedCompositionDetails[i]}) — its properties are missing from the list above.`,
        )
      : undefined;

    return createToolResult({
      id: data.id ?? id,
      alias: data.alias ?? "",
      name: data.name ?? data.alias ?? "Unknown",
      description: data.description || undefined,
      variesByCulture: data.variesByCulture || undefined,
      variesBySegment: data.variesBySegment || undefined,
      properties: properties.map((p) => ({
        alias: p.alias ?? "",
        name: p.name ?? p.alias ?? "",
        description: p.description || undefined,
        dataTypeId: p.dataType?.id || undefined,
        variesByCulture: p.variesByCulture || undefined,
        variesBySegment: p.variesBySegment || undefined,
      })),
      warnings,
    });
  },
};

export default withStandardDecorators(tool);
