import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPublishedUrls, publishedUrlsSchema } from "../../helpers/preview-url.js";
import { resolveEditorAliases } from "../helpers/resolve-editor-aliases.js";
import { resolvePageCulture } from "../helpers/resolve-page-culture.js";

const inputSchema = {
  name: z.string().describe("The name of the page to create"),
  documentTypeId: z.string().uuid().describe("The ID of the document type to use. Call list-document-types first to find available types."),
  parentId: z.string().uuid().optional().describe("The ID of the parent page. If omitted, the page is created at the root"),
  culture: z.string().optional().describe("Culture (ISO code, e.g. en-US) to create the page in. Only used when the document type varies by culture; defaults to the site's default language. Call list-languages for the available cultures. Add further languages afterwards with create-variant or copy-variant."),
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
  culture: z.string().nullable().describe("The culture the page was created in — the requested `culture`, or the site's default language when none was given. Null when the document type does not vary by culture."),
  publishedUrls: publishedUrlsSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-and-publish-page",
  description: "Create a new content page and publish it in one atomic operation — mirrors clicking 'Save and publish' (instead of 'Save') on the create screen in the Umbraco backoffice. Call list-document-types first to find a valid documentTypeId. Use this as a starting point: pass `name`, `documentTypeId`, optional `parentId`, and at most a small number of simple initial values. If the document type requires properties this doesn't set, or if the values fail validation, the whole operation fails and no page is created — use create-page followed by save-and-publish instead when you need to build up content across multiple calls before publishing. On a multilingual site, a document type that varies by culture is created in `culture` (default: the site's default language); values without a culture on culture-variant properties are stored in that culture too. If the site has a mandatory language other than that culture, the page can't be published from a single call — the tool says so and creates nothing; use create-page, create-variant, then publish instead.",
  inputSchema,
  outputSchema,
  slices: ["create", "publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, documentTypeId, parentId, culture, values }) => {
    // A culture-variant document type must be created with a culture variant —
    // without `cultures` the CMS tool sends a single `culture: null` variant,
    // which Umbraco rejects. `forPublish` also rejects, up front, a page that
    // would be missing a mandatory language. See resolve-page-culture.ts.
    const cultureResult = await resolvePageCulture(documentTypeId, culture, { forPublish: true });
    if (!cultureResult.ok) return cultureResult.errorResult;
    const { culture: pageCulture, documentType, siteCultures } = cultureResult;

    // CreateAndPublishDocumentInput requires editorAlias on each value, same as
    // create-document. The LLM only supplies the property alias, so resolve
    // editorAlias by looking up the document type's own + composition-inherited
    // properties -> data types -> editorAlias. Fails fast (before calling
    // Umbraco) when an alias isn't a property on this document type at all —
    // see #201.
    const resolved = await resolveEditorAliases(documentTypeId, values, { defaultCulture: pageCulture, documentType, siteCultures });
    if (!resolved.ok) return resolved.errorResult;

    const createResult = await chainCms("create-and-publish-document", {
      documentTypeId,
      name,
      values: resolved.values,
      ...(pageCulture ? { cultures: [pageCulture] } : {}),
      ...(parentId ? { parentId } : {}),
    });
    if (!createResult.ok) return createResult.errorResult;
    const createdId = createResult.data.id;

    return createToolResult({
      message: `Created and published "${name}"`,
      id: createdId,
      name,
      culture: pageCulture,
      publishedUrls: createdId ? await fetchPublishedUrls(createdId) : [],
    });
  },
};

export default withStandardDecorators(tool);
