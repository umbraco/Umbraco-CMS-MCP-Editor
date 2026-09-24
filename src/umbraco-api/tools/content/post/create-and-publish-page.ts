import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPublishedUrls, publishedUrlsSchema } from "../../helpers/preview-url.js";
import { checkHumanInTheLoop } from "../../helpers/human-in-the-loop.js";

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
  publishedUrls: publishedUrlsSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-and-publish-page",
  description: "Create a new content page and publish it in one atomic operation — mirrors clicking 'Save and publish' (instead of 'Save') on the create screen in the Umbraco backoffice. Call list-document-types first to find a valid documentTypeId. Use this as a starting point: pass `name`, `documentTypeId`, optional `parentId`, and at most a small number of simple initial values. If the document type requires properties this doesn't set, or if the values fail validation, the whole operation fails and no page is created — use create-page followed by save-and-publish instead when you need to build up content across multiple calls before publishing.",
  inputSchema,
  outputSchema,
  slices: ["create", "publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, documentTypeId, parentId, values }) => {
    const gate = checkHumanInTheLoop({
      verb: "publish",
      hint: "To create the page as a draft without publishing, use create-page instead.",
    });
    if (gate) return gate;

    // CreateAndPublishDocumentInput requires editorAlias on each value, same as
    // create-document. The LLM only supplies the property alias, so resolve
    // editorAlias by looking up the document type's properties -> data types.
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

    const createResult = await chainCms("create-and-publish-document", {
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
      message: `Created and published "${name}"`,
      id: createdId,
      name,
      publishedUrls: createdId ? await fetchPublishedUrls(createdId) : [],
    });
  },
};

export default withStandardDecorators(tool);
