import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";
import { verifyDocumentPublished } from "../../helpers/verify-published.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to publish"),
  includeDescendants: z.boolean().optional().default(false).describe("Whether to also publish all child pages"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "publish-page",
  description: "Publish a content page to make it live on the website — use this when the draft is already correct and just needs to go live. If you also need to apply property changes in the same step, use save-and-publish instead. Pass includeDescendants to publish all child pages too. Use unpublish-page to take a page back offline.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, includeDescendants }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";

    if (includeDescendants) {
      if (!await confirmStep(extra, `Publish "${pageName}" and all its descendants?`)) {
        return createToolResult({ message: "Publish cancelled", id, name: pageName });
      }
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
    if (!publishResult.ok) return publishResult.errorResult;

    // Verify the publish actually took effect — the chained call can return ok
    // while a workflow/event handler reverts the publish. Skip for the
    // descendants path because that runs asynchronously via a task.
    if (!includeDescendants) {
      const verifyError = await verifyDocumentPublished(id, variantCultures);
      if (verifyError) {
        return createToolResultError({
          status: 500,
          title: "Publish did not take effect",
          detail: `"${pageName}": ${verifyError}`,
        });
      }
    }

    return createToolResult({
      message: includeDescendants ? `Published "${pageName}" and all child pages` : `Published "${pageName}"`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
