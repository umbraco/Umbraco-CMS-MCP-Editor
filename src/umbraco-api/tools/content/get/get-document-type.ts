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
    interface RawProperty {
      alias?: string;
      name?: string;
      description?: string | null;
      dataType?: { id?: string };
      variesByCulture?: boolean;
      variesBySegment?: boolean;
    }
    interface RawDocType {
      id?: string;
      alias?: string;
      name?: string;
      description?: string | null;
      variesByCulture?: boolean;
      variesBySegment?: boolean;
      properties?: RawProperty[];
      compositions?: { document?: { id?: string }; documentType?: { id?: string }; id?: string; compositionType?: string }[];
    }

    const result = await chainCms("get-document-type-by-id", { id });
    if (!result.ok) return result.errorResult;
    const data = result.data as RawDocType;

    // The doc type itself often has no direct properties — they're inherited
    // via compositions. Walk compositions and merge their properties so the
    // returned list reflects everything an editor can actually set on the page.
    const collected = new Map<string, RawProperty>();

    function addProperties(props: RawProperty[]): void {
      for (const p of props) {
        if (p.alias && !collected.has(p.alias)) {
          collected.set(p.alias, p);
        }
      }
    }

    addProperties(Array.isArray(data.properties) ? data.properties : []);

    const compositionIds = (data.compositions ?? [])
      .map((c) => c.document?.id ?? c.documentType?.id ?? c.id)
      .filter((cid): cid is string => typeof cid === "string");
    if (compositionIds.length > 0) {
      const compositions = await Promise.all(
        compositionIds.map(async (cid) => {
          const r = await chainCms("get-document-type-by-id", { id: cid });
          return r.ok ? (r.data as RawDocType) : null;
        }),
      );
      for (const comp of compositions) {
        if (comp && Array.isArray(comp.properties)) addProperties(comp.properties);
      }
    }

    return createToolResult({
      id: data.id ?? id,
      alias: data.alias ?? "",
      name: data.name ?? data.alias ?? "Unknown",
      description: data.description || undefined,
      variesByCulture: data.variesByCulture || undefined,
      variesBySegment: data.variesBySegment || undefined,
      properties: Array.from(collected.values()).map((p) => ({
        alias: p.alias ?? "",
        name: p.name ?? p.alias ?? "",
        description: p.description || undefined,
        dataTypeId: p.dataType?.id || undefined,
        variesByCulture: p.variesByCulture || undefined,
        variesBySegment: p.variesBySegment || undefined,
      })),
    });
  },
};

export default withStandardDecorators(tool);
