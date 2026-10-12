import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPublishedUrls, publishedUrlsSchema } from "../../helpers/preview-url.js";
import { resolveEditorAliases } from "../helpers/resolve-editor-aliases.js";

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
    // CreateAndPublishDocumentInput requires editorAlias on each value, same as
    // create-document. The LLM only supplies the property alias, so resolve
    // editorAlias by looking up the document type's own + composition-inherited
    // properties -> data types -> editorAlias. Fails fast (before calling
    // Umbraco) when an alias isn't a property on this document type at all —
    // see #201.
    const resolved = await resolveEditorAliases(documentTypeId, values);
    if (!resolved.ok) return resolved.errorResult;

    const createResult = await chainCms("create-and-publish-document", {
      documentTypeId,
      name,
      values: resolved.values,
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
