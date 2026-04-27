import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

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
  description: "Create a new content page as a draft. The page will NOT be published automatically. Call list-document-types first to find a valid documentTypeId.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, documentTypeId, parentId, values }) => {
    // CreateDocumentInput requires editorAlias on each value. The LLM only
    // supplies the property alias, so resolve editorAlias by looking up the
    // document type's properties → their data types → editorAlias.
    const editorAliasByPropertyAlias = new Map<string, string>();
    if (values && values.length > 0) {
      const docTypeResult = await chainCms("get-document-type-by-id", { id: documentTypeId });
      if (!docTypeResult.ok) return docTypeResult.errorResult;
      const dataTypeIds = Array.from(new Set(docTypeResult.data.properties.map(p => p.dataType.id)));
      const dataTypesResult = await chainCms("get-data-types-by-id-array", { id: dataTypeIds });
      if (!dataTypesResult.ok) return dataTypesResult.errorResult;
      const editorAliasByDataTypeId = new Map(
        dataTypesResult.data.items.map(dt => [dt.id, dt.editorAlias]),
      );
      for (const prop of docTypeResult.data.properties) {
        const editorAlias = editorAliasByDataTypeId.get(prop.dataType.id);
        if (editorAlias) editorAliasByPropertyAlias.set(prop.alias, editorAlias);
      }
    }

    const createResult = await chainCms("create-document", {
      documentTypeId,
      name,
      values: (values ?? []).map(v => ({
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
        editorAlias: editorAliasByPropertyAlias.get(v.alias) ?? "",
      })),
      ...(parentId ? { parentId } : {}),
    });
    if (!createResult.ok) return createResult.errorResult;
    const createdId = createResult.data.id;

    return createToolResult({
      message: `Created draft page "${name}"`,
      id: createdId,
      name,
    });
  },
};

export default withStandardDecorators(tool);
