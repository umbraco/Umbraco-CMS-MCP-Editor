import { z } from "zod";
import { withStandardDecorators, createToolResultError, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildBlockWriteResult } from "../../helpers/block-builder.js";
import { findLayoutEntry, findPropertyValue, getBlockContainer } from "../../helpers/library-blocks.js";
import { previewUrlSchema } from "../../helpers/preview-url.js";
import { validationResultSchema } from "../../helpers/validate-document.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the Library block"),
  propertyAlias: z.string().describe("The document property alias holding the block (e.g. 'contentRows'). Use inspect-blocks to find this."),
  elementId: z.string().uuid().describe("The Library Element id the block links to (libraryBlocks[].elementId from inspect-blocks). If the same Element appears more than once in the property, pass that placement's layoutKey instead."),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string().describe("The new local block's contentKey — edit it with edit-block"),
  previewUrl: previewUrlSchema,
  validation: validationResultSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "disconnect-block-from-library",
  description: "Turn a Library-linked block on a page back into a local block, mirroring the back office's \"Disconnect from Library\" block action. Copies the Library Element's current content into a new local block in the same position (settings kept), so later changes to the Element no longer affect this page and vice versa. The Library Element itself is not changed or deleted — other pages using it are unaffected. Use inspect-blocks first: Library blocks are listed under libraryBlocks. The page is saved as a draft, NOT published. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, propertyAlias, elementId, culture, segment }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";
    const fail = (text: string) => createToolResultError({ content: [{ type: "text", text }], isError: true });

    const prop = findPropertyValue(doc.values ?? [], propertyAlias, culture, segment);
    if (!prop) {
      return fail(`Property '${propertyAlias}' not found on page '${pageName}'. Use inspect-blocks to see available properties.`);
    }
    const located = getBlockContainer(prop.value, prop.editorAlias);
    const entry = located ? findLayoutEntry(located.container, elementId) : undefined;
    if (!entry) {
      return fail(`Library block '${elementId}' was not found in property '${propertyAlias}' on '${pageName}'. Use inspect-blocks — Library blocks are listed under libraryBlocks.`);
    }
    if (entry.isExternalContent !== true) {
      return fail(`Block '${elementId}' is already a local block, not linked to the Library — there is nothing to disconnect. Edit it with edit-block.`);
    }

    // Same wording as the back office's confirmation dialog.
    const confirmed = await requestApproval(
      extra,
      `Disconnect from Library on "${pageName}" (${propertyAlias})? This will create a local copy of the Element content. The Library Element will not be affected. The page will be saved as a draft, not published.`,
    );
    if (!confirmed) {
      return fail("Cancelled by user.");
    }

    const disconnectResult = await chainCms("disconnect-document-block-from-library", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      contentKey: elementId,
    });
    if (!disconnectResult.ok) return disconnectResult.errorResult;

    return buildBlockWriteResult(
      id,
      pageName,
      disconnectResult.data.results[0].contentKey,
      `Disconnected the block on "${pageName}" from the Library — it is now a local copy (saved, not published). The Library Element is unchanged`,
    );
  },
};

export default withStandardDecorators(tool);
