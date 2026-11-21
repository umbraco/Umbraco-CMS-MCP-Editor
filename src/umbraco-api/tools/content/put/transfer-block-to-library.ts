import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import {
  blockValueCultures,
  elementVariantStates,
  findLayoutEntry,
  findPropertyValue,
  getBlockContainer,
  getBlockedTransferVariants,
  unpublishedCulturesOf,
} from "../../helpers/library-blocks.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";
import { validateDocumentState, validationResultSchema } from "../../helpers/validate-document.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the block"),
  propertyAlias: z.string().describe("The document property alias holding the block (e.g. 'contentRows'). Use inspect-blocks to find this."),
  contentKey: z.string().uuid().describe("The contentKey of the local block to transfer. Use inspect-blocks to find this."),
  name: z.string().min(1).describe("Name for the new Library Element (required, as in the back office's Transfer to Library dialog). Pick a name that says what the content is, so editors can find it in the Library."),
  parentFolderId: z.string().uuid().optional().describe("Library folder to create the Element in. Omit to create it at the Library root. Use list-element-children to find folders."),
  publish: z.boolean().optional().default(true).describe("Publish the new Element in the languages the block is shown in (default true, as the back office does). With false the Element stays a draft and the block will not render on the site until the Element is published with publish-element."),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  elementId: z.string().describe("The new Library Element's id — the block now references it. Edit the shared content with edit-element."),
  elementName: z.string(),
  published: z.boolean().describe("Whether the Element was published in every language the block is shown in. A Library block does not render in a language where its Element isn't published."),
  elementVariants: z.array(z.object({
    culture: z.string().nullable().describe("The language (null for an Element that doesn't vary by culture)"),
    name: z.string(),
    state: z.string().describe("Publish state in that language, e.g. Published or Draft"),
  })).describe("The new Element's languages and their publish state"),
  previewUrl: previewUrlSchema,
  validation: validationResultSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "transfer-block-to-library",
  description: "Move a local block on a page into the Library as a reusable Element, mirroring the back office's \"Transfer to Library\" block action. Creates a new Library Element from the block's content (named `name`, at the Library root or in parentFolderId), publishes it by default, and replaces the block with a link to that Element — same position and settings. The shared content is then edited once with edit-element and can be added to other pages with add-library-block; changes to it show everywhere it is used. Only works for blocks whose element type is allowed in the Library, and — like the back office — only when you have access to every language the block has content in. On a multilingual site the Element gets every language the block has content in and is published in the languages the block is shown in; the result lists each language's publish state. Use inspect-blocks first to find the propertyAlias and contentKey. To undo on this page, use disconnect-block-from-library (the created Element stays in the Library; remove it with delete-element if it is no longer needed). The page is saved as a draft, NOT published.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, propertyAlias, contentKey, name, parentFolderId, publish, culture, segment }) => {
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
    if (!located) {
      return fail(`Property '${propertyAlias}' on '${pageName}' has no blocks (it must be a BlockList, BlockGrid, or Rich Text with blocks). Use inspect-blocks to confirm.`);
    }
    const entry = findLayoutEntry(located.container, contentKey);
    if (!entry) {
      return fail(`Block '${contentKey}' was not found in property '${propertyAlias}' on '${pageName}'. Use inspect-blocks to find the block's contentKey.`);
    }
    if (entry.isExternalContent === true) {
      return fail(`Block '${contentKey}' is already linked to Library Element '${entry.contentKey}'. Edit its content with edit-element, or use disconnect-block-from-library to make it local again.`);
    }
    const block = located.container.contentData.find((b) => b.key === entry.contentKey);
    if (!block) {
      return fail(`Block '${contentKey}' has no content on '${pageName}', so it cannot be transferred.`);
    }

    // The back office only offers "Transfer to Library" when the block's element
    // type is allowed in the Library; the chained tool doesn't check, so do it here.
    const typeResult = await chainCms("get-document-type-by-id", { id: block.contentTypeKey });
    if (!typeResult.ok) return typeResult.errorResult;
    if (!typeResult.data.allowedInLibrary) {
      return fail(`This block's element type '${typeResult.data.name}' is not allowed in the Library, so the block can't be transferred. An administrator can enable "Allowed in Library" on that element type in Settings.`);
    }
    const variesByCulture = typeResult.data.variesByCulture === true;

    // Like the back office, refuse when the block holds content in languages the
    // user can't edit — the new Element would carry that content. (The chained
    // tool doesn't check this either.)
    const userResult = await chainCms("get-user-current", {});
    if (!userResult.ok) return userResult.errorResult;
    const blocked = getBlockedTransferVariants({
      valueCultures: blockValueCultures(block.values ?? []),
      variesByCulture,
      access: userResult.data,
    });
    if (blocked.cultures.length > 0 || blocked.invariant) {
      const reasons = [
        ...(blocked.cultures.length > 0 ? [`This Block has content in languages you do not have access to: ${blocked.cultures.join(", ")}.`] : []),
        ...(blocked.invariant ? ["It has shared content that you do not have access to edit."] : []),
      ];
      return fail(`Transfer not permitted. ${reasons.join(" ")}`);
    }

    // The cultures the back office publishes the new Element in: the languages
    // the block is shown in (its expose entries), or the single invariant
    // variant when the element type doesn't vary by culture.
    const exposedCultures = (located.container.expose ?? [])
      .filter((e) => e.contentKey === block.key)
      .map((e) => e.culture ?? null);
    const expectedCultures: Array<string | null> = variesByCulture
      ? [...new Set(exposedCultures.filter((c): c is string => c !== null))]
      : (exposedCultures.length > 0 ? [null] : []);

    const transferResult = await chainCms("transfer-document-block-to-library", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      contentKey,
      name,
      parentId: parentFolderId ?? null,
      publish,
    });
    if (!transferResult.ok) return transferResult.errorResult;

    const result = transferResult.data.results[0];
    const elementId = result.contentKey;
    const elementResult = await chainCms("get-element-by-id", { id: elementId });
    const publishStateKnown = elementResult.ok;
    const elementVariants = elementResult.ok ? elementVariantStates(elementResult.data.variants) : [];
    const unpublished = unpublishedCulturesOf(elementVariants, expectedCultures);
    const published = publishStateKnown && expectedCultures.length > 0 && unpublished.length === 0;
    const partlyPublished = publishStateKnown && unpublished.length > 0 && unpublished.length < expectedCultures.length;
    const linked = `created Element "${name}" and linked the block on "${pageName}" to it`;
    const inCultures = variesByCulture && expectedCultures.length > 0 ? ` (published in ${expectedCultures.join(", ")})` : "";

    // Same outcomes as the back office's toast after a transfer, per language
    // when the Element varies by culture.
    let baseMessage: string;
    if (!publishStateKnown) {
      baseMessage = `Transferred to Library: ${linked}, but its publish state couldn't be verified — check it with get-element. Page saved, not published`;
    } else if (published) {
      baseMessage = `Transferred to Library: ${linked}${inCultures}. Page saved, not published`;
    } else if (publish === false) {
      baseMessage = `Transferred to Library as draft: ${linked}. The block won't render until the Element is published (publish-element). Page saved, not published`;
    } else if (expectedCultures.length === 0) {
      baseMessage = `Transferred to Library as draft: ${linked}. The block wasn't shown in any language, so the Element was not published — publish it with publish-element when it should appear. Page saved, not published`;
    } else if (partlyPublished) {
      baseMessage = `Transferred to Library, but not published in ${unpublished.join(", ")}: ${linked}. The block won't render in those languages until the Element is published there — it may have validation errors; fix with edit-element, then publish-element. Page saved, not published`;
    } else {
      baseMessage = `Transferred to Library, but not published: ${linked}, but it could not be published — it may have validation errors. Fix it with edit-element, then publish-element. Page saved, not published`;
    }

    const validation = await validateDocumentState(id);
    const message = validation.valid
      ? baseMessage
      : `${baseMessage} — but ${validation.errors.length} validation error(s) must be resolved before this page can be published`;

    return createToolResult({
      message,
      id,
      name: pageName,
      elementId,
      elementName: name,
      published,
      elementVariants,
      previewUrl: await fetchPreviewUrl(id),
      validation,
    });
  },
};

export default withStandardDecorators(tool);
