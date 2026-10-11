import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { enrichBlockNotFoundError, findSettingsKey, isRteWithBlocks, splitBlockUpdateResults } from "../../helpers/block-inspector.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";
import { validateDocumentState, validationResultSchema } from "../../helpers/validate-document.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the block"),
  propertyAlias: z.string().describe("The document property alias containing the blocks (e.g. 'mainContent'). Use inspect-blocks to find this."),
  contentKey: z.string().uuid().describe("The unique key of the block to edit. Use inspect-blocks to find this."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias within the block"),
    value: z.any().describe("The new value for the property"),
  })).describe("Properties to update within the block"),
  blockType: z.enum(["content", "settings"]).optional().describe("Whether to update the block's content or its settings. Defaults to 'content'."),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string(),
  updatedFields: z.array(z.string()),
  previewUrl: previewUrlSchema,
  validation: validationResultSchema,
  warnings: z.array(z.string()).optional(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-block",
  description: "Update properties within a specific block (BlockList, BlockGrid, or Rich Text block). Use inspect-blocks first to find the propertyAlias and contentKey. Pass blockType='settings' to edit a block's settings instead of its content. For non-block page properties, use edit-page instead. Content pages only — for a block on a Library element use inspect-element-blocks then edit-element-block, not this tool. For structured property values inside the block (media pickers, content pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. Culture/segment applies to the document property level — use separate calls for mixed-variant blocks. Changes are saved but NOT published. The response includes a `validation` field — if `validation.valid` is false the changes were saved but the parent page cannot be published until the listed errors are resolved.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, propertyAlias, contentKey, values, blockType, culture, segment }) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";
    const fieldNames = values.map((v) => v.alias);
    const resolvedBlockType = blockType ?? "content";

    // A block's settings live in a separate `settingsData` entry under its own
    // key, and update-block-property addresses blocks by that key — so for a
    // settings edit, translate the caller's contentKey (what inspect-blocks
    // reports) into the paired settingsKey.
    let targetKey = contentKey;
    if (resolvedBlockType === "settings") {
      const rawValue = (docResult.data.values ?? []).find(
        (v) => v.alias === propertyAlias && (v.culture ?? null) === (culture ?? null) && (v.segment ?? null) === (segment ?? null),
      )?.value;
      const container = isRteWithBlocks(rawValue) ? (rawValue as { blocks: unknown }).blocks : rawValue;
      const settingsKey = findSettingsKey(container, contentKey);
      if (!settingsKey) {
        return createToolResultError(
          `Block ${contentKey} in property "${propertyAlias}" has no settings entry, so its settings cannot be edited. Use inspect-blocks to check for a settingsKey, or omit blockType to edit the block's content.`,
        );
      }
      targetKey = settingsKey;
    }

    const propsTuple = values.map(v => ({ alias: v.alias, value: v.value })) as [
      { alias: string; value: any }, ...{ alias: string; value: any }[]
    ];
    const updateResult = await chainCms("update-block-property", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      updates: [{
        contentKey: targetKey,
        blockType: resolvedBlockType,
        properties: propsTuple,
      }],
    });
    if (!updateResult.ok) {
      return enrichBlockNotFoundError(
        updateResult.errorResult,
        docResult.data.values ?? [],
        propertyAlias,
        { noteSettingsKeys: true },
      );
    }

    // `update-block-property`'s top-level `success` is always true once the
    // call itself completes — per-block outcomes live only in `results[]`.
    // Don't trust the chained tool's declared shape: a missing/empty
    // `results` array is treated as a failure too. edit-element-block.ts uses
    // the simpler `(results ?? []).filter(r => r.success === false)`, which
    // misses a block that only *partly* wrote — Umbraco sets
    // `success: totalProcessed > 0 || errors.length === 0`, so a block with
    // one valid alias and one invalid one comes back `success: true` with
    // `errors` filled. `splitBlockUpdateResults` separates "nothing was
    // written" (every entry has `success !== true`) from "something was
    // written, but with errors" (a partial write), so the two are reported
    // differently below instead of both being read as a full success.
    const results = updateResult.data.results;
    if (!results || results.length === 0) {
      return createToolResultError(
        "update-block-property returned no per-block result — cannot confirm the write succeeded.",
      );
    }
    const { hardFailed, errors, warnings } = splitBlockUpdateResults(results);
    if (hardFailed.length === results.length) {
      const detail = hardFailed
        .flatMap((r) => (r.errors?.length ? r.errors : [r.message]))
        .join("; ");
      return createToolResultError(
        `Block update failed: ${detail || updateResult.data.message || "no detail returned"}`,
      );
    }

    const validation = await validateDocumentState(id);
    const target = resolvedBlockType === "settings" ? "settings" : "content";
    const baseMessage = errors.length > 0
      ? `Updated block ${target} on "${pageName}" (saved, not published) — but ${errors.length} field(s) failed: ${errors.join("; ")}`
      : `Updated ${fieldNames.length} field(s) in block ${target} on "${pageName}" (saved, not published)`;
    const message = validation.valid
      ? baseMessage
      : `${baseMessage} — but ${validation.errors.length} validation error(s) must be resolved before this page can be published`;

    return createToolResult({
      message,
      id,
      name: pageName,
      contentKey,
      updatedFields: fieldNames,
      previewUrl: await fetchPreviewUrl(id),
      validation,
      ...(warnings.length ? { warnings } : {}),
    });
  },
};

export default withStandardDecorators(tool);
