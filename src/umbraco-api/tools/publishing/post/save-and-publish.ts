import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPublishedUrls, publishedUrlsSchema } from "../../helpers/preview-url.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to save and publish"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The new property value"),
    culture: z.string().nullable().optional().describe("The culture code for variant content"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
  })).optional().describe("Optional property values to update before publishing. If omitted, the current draft is published as-is."),
  includeDescendants: z.boolean().optional().default(false).describe("Whether to also publish all child pages"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  saved: z.boolean(),
  published: z.boolean(),
  updatedFields: z.array(z.string()),
  publishedUrls: publishedUrlsSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "save-and-publish",
  description: "Save property changes and publish a content page in one atomic operation — mirrors the 'Save and publish' button in the Umbraco backoffice. If `values` is provided the changes are saved first; then the page is published. Optionally publish descendants. Call get-page or get-document-type first to discover valid property aliases.",
  inputSchema,
  outputSchema,
  slices: ["publish", "update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, values, includeDescendants }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";
    const fieldNames = (values ?? []).map((v) => v.alias);

    // Match the UI: publishing with descendants has unknown scope, so confirm it.
    if (includeDescendants) {
      if (!await confirmAction(extra, `Publish "${pageName}" and all its descendants?`, { title: "Confirm publish with descendants" })) {
        return createToolResult({
          message: "Save and publish cancelled",
          id,
          name: pageName,
          saved: false,
          published: false,
          updatedFields: [],
          publishedUrls: [],
        });
      }
    }

    let saved = false;
    if (values && values.length > 0) {
      const properties = values.map(v => ({
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
      })) as [(typeof values)[number], ...(typeof values)[number][]];
      const updateResult = await chainCms("update-document-properties", { id, properties });
      if (!updateResult.ok) return updateResult.errorResult;
      saved = true;
    }

    // publish-document requires one publishSchedules entry per culture to
    // actually publish — an empty array is a no-op in Umbraco. Derive from the
    // doc's variants (invariant content yields a single `culture: null` entry).
    const variantCultures: Array<string | null> = (doc.variants ?? []).length
      ? doc.variants.map(v => v.culture ?? null)
      : [null];
    const publishResult = includeDescendants
      ? await chainCms("publish-document-with-descendants", {
          id,
          data: {
            includeUnpublishedDescendants: false,
            cultures: variantCultures.filter((c): c is string => c !== null),
          },
        })
      : await chainCms("publish-document", {
          id,
          data: { publishSchedules: variantCultures.map(c => ({ culture: c })) },
        });
    if (!publishResult.ok) {
      if (saved) {
        return createToolResult({
          message: `Saved ${fieldNames.length} field(s) on "${pageName}" but publish failed: ${publishResult.errorResult.content?.[0]?.text ?? "unknown error"}`,
          id,
          name: pageName,
          saved: true,
          published: false,
          updatedFields: fieldNames,
          publishedUrls: [],
        });
      }
      return publishResult.errorResult;
    }

    const publishedUrls = await fetchPublishedUrls(id);

    const savedPart = saved ? `Saved ${fieldNames.length} field(s) and ` : "";
    const descPart = includeDescendants ? " and all descendants" : "";
    return createToolResult({
      message: `${savedPart}published "${pageName}"${descPart}`,
      id,
      name: pageName,
      saved,
      published: true,
      updatedFields: fieldNames,
      publishedUrls,
    });
  },
};

export default withStandardDecorators(tool);
