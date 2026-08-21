import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPublishedUrls, publishedUrlsSchema } from "../../helpers/preview-url.js";
import { verifyDocumentPublished } from "../../helpers/verify-published.js";

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

/** A property value in the shape `update-and-publish-document` expects. */
interface DocumentValue {
  alias: string;
  value?: unknown;
  culture?: string | null;
  segment?: string | null;
}

/** Values are addressed by alias + culture + segment, with undefined === null. */
function valueKey(value: DocumentValue): string {
  return `${value.alias}|${value.culture ?? ""}|${value.segment ?? ""}`;
}

function normaliseValue(value: DocumentValue): DocumentValue {
  return {
    alias: value.alias,
    value: value.value,
    culture: value.culture ?? null,
    segment: value.segment ?? null,
  };
}

/**
 * Merge the caller's partial property values into the document's full current
 * value set.
 *
 * `update-and-publish-document` is a full-replace PUT — whatever lands in
 * `data.values` becomes the document's complete value set. Sending only the
 * caller's partial `values` would silently wipe every other property on the
 * page. So we start from the document's current values (as returned by
 * `get-document-by-id`), overwrite the entries the caller addressed, and append
 * any the document doesn't have yet.
 *
 * Note the mapping to the payload shape: `get-document-by-id` values also carry
 * `editorAlias`, which the update payload doesn't accept.
 */
export function mergeValues(current: DocumentValue[], incoming: DocumentValue[]): DocumentValue[] {
  const merged = current.map(normaliseValue);
  const indexByKey = new Map(merged.map((value, index) => [valueKey(value), index]));

  for (const value of incoming) {
    const next = normaliseValue(value);
    const key = valueKey(next);
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      merged[existingIndex] = next;
    } else {
      indexByKey.set(key, merged.length);
      merged.push(next);
    }
  }

  return merged;
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "save-and-publish",
  description: "Save property changes and publish a content page in one atomic operation — mirrors the 'Save and publish' button in the Umbraco backoffice. If `values` is provided the changes are saved and published in a single call; otherwise the current draft is published as-is. Optionally publish descendants. Call get-page or get-document-type first to discover valid property aliases.",
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
    const hasValues = (values?.length ?? 0) > 0;

    // Match the UI: publishing with descendants has unknown scope, so confirm it.
    if (includeDescendants) {
      if (!await requestApproval(extra, `Publish "${pageName}" and all its descendants?`)) {
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

    // Publishing needs the document's cultures. Derive from the doc's variants
    // (invariant content yields a single `culture: null` entry).
    const variantCultures: Array<string | null> = (doc.variants ?? []).length
      ? doc.variants.map(v => v.culture ?? null)
      : [null];

    // `publish-document-with-descendants` has no update-and-publish equivalent,
    // so the descendants path keeps the two-call save-then-publish sequence.
    if (includeDescendants) {
      let saved = false;
      if (hasValues) {
        const properties = values!.map(v => ({
          alias: v.alias,
          value: v.value,
          culture: v.culture ?? null,
          segment: v.segment ?? null,
        })) as [DocumentValue, ...DocumentValue[]];
        const updateResult = await chainCms("update-document-properties", { id, properties });
        if (!updateResult.ok) return updateResult.errorResult;
        saved = true;
      }

      const publishResult = await chainCms("publish-document-with-descendants", {
        id,
        data: {
          includeUnpublishedDescendants: false,
          cultures: variantCultures.filter((c): c is string => c !== null),
        },
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

      // No verify step here — publishing descendants runs asynchronously via a
      // background task, so the state right after the call is not meaningful.
      const savedPart = saved ? `Saved ${fieldNames.length} field(s) and ` : "";
      return createToolResult({
        message: `${savedPart}published "${pageName}" and all descendants`,
        id,
        name: pageName,
        saved,
        published: true,
        updatedFields: fieldNames,
        publishedUrls: await fetchPublishedUrls(id),
      });
    }

    if (hasValues) {
      // One atomic call: save + publish. Because this is a full-replace PUT the
      // caller's partial values are merged into the document's current value set
      // first — otherwise every untouched property would be wiped.
      // `culturesToPublish` takes real culture codes only; an empty array
      // publishes the single invariant variant.
      const updateAndPublishResult = await chainCms("update-and-publish-document", {
        id,
        data: {
          culturesToPublish: [...new Set(variantCultures.filter((c): c is string => c !== null))],
          template: doc.template ?? null,
          values: mergeValues(doc.values ?? [], values!),
          variants: (doc.variants ?? []).map(v => ({
            culture: v.culture ?? null,
            segment: v.segment ?? null,
            name: v.name,
          })),
        },
      });
      // The call is atomic — a failure means nothing was saved and nothing was
      // published, so there is no "saved but publish failed" state to report.
      // Say that explicitly rather than passing the raw publish error back: the
      // `includeDescendants` branch above *does* report a saved-but-unpublished
      // state, so an unqualified failure here would read as "your edits landed,
      // only the publish didn't" — the opposite of what happened.
      if (!updateAndPublishResult.ok) {
        const rolledBack = `No changes were saved to "${pageName}" — save-and-publish is a single atomic operation, so the field updates were rolled back along with the publish.`;
        const problem = updateAndPublishResult.errorResult.structuredContent;
        return createToolResultError({
          status: 500,
          title: "Save and publish failed",
          ...problem,
          detail: problem?.detail ? `${String(problem.detail)} ${rolledBack}` : rolledBack,
        });
      }
    } else {
      // publish-document requires one publishSchedules entry per culture to
      // actually publish — an empty array is a no-op in Umbraco.
      const publishResult = await chainCms("publish-document", {
        id,
        data: { publishSchedules: variantCultures.map(c => ({ culture: c })) },
      });
      if (!publishResult.ok) return publishResult.errorResult;
    }

    // Verify the publish actually took effect — the chained call can return ok
    // while a workflow/event handler reverts the publish. Still required on the
    // atomic path: Umbraco accepts and persists the values, then a Workflow
    // event handler can roll the publish back, leaving a saved-but-draft page.
    const verifyError = await verifyDocumentPublished(id, variantCultures);
    if (verifyError) {
      if (hasValues) {
        return createToolResult({
          message: `Saved ${fieldNames.length} field(s) on "${pageName}" but publish did not take effect: ${verifyError}`,
          id,
          name: pageName,
          saved: true,
          published: false,
          updatedFields: fieldNames,
          publishedUrls: [],
        });
      }
      return createToolResultError({
        status: 500,
        title: "Publish did not take effect",
        detail: `"${pageName}": ${verifyError}`,
      });
    }

    const publishedUrls = await fetchPublishedUrls(id);

    const savedPart = hasValues ? `Saved ${fieldNames.length} field(s) and ` : "";
    return createToolResult({
      message: `${savedPart}published "${pageName}"`,
      id,
      name: pageName,
      saved: hasValues,
      published: true,
      updatedFields: fieldNames,
      publishedUrls,
    });
  },
};

export default withStandardDecorators(tool);
