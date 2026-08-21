import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { findSettingsKey, isRteWithBlocks } from "../../helpers/block-inspector.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the Library element containing the block"),
  propertyAlias: z.string().describe("The element property alias containing the blocks (e.g. 'mainContent'). Use inspect-element-blocks to find this."),
  contentKey: z.string().uuid().describe("The unique key of the block to edit — always the block's contentKey as reported by inspect-element-blocks, including when blockType is 'settings'."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias within the block"),
    value: z.any().describe("The new value for the property"),
  })).min(1).describe("Properties to update within the block"),
  blockType: z.enum(["content", "settings"]).optional().describe("Whether to update the block's content or its settings. Defaults to 'content'."),
  culture: z.string().nullable().optional().describe("Culture code if the element property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the element property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string(),
  updatedFields: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-element-block",
  description: "Update properties within a specific block (BlockList, BlockGrid, or Rich Text block) on a Library element. Use inspect-element-blocks first to find the propertyAlias and contentKey. Pass blockType='settings' to edit a block's settings instead of its content — still pass the block's contentKey, this tool resolves the settings entry itself. For non-block element properties use edit-element instead; for blocks on a content page use edit-block instead. For structured property values inside the block (media pickers, content pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. Culture/segment applies to the element property level — use separate calls for mixed-variant blocks. Changes are saved but NOT published — publish separately with publish-element. Elements are the document-like reusable content items in the Library section (Umbraco 18).",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, propertyAlias, contentKey, values, blockType, culture, segment }) => {
    const elResult = await chainCms("get-element-by-id", { id });
    if (!elResult.ok) return elResult.errorResult;
    const elementName = elResult.data.variants?.[0]?.name ?? "Unknown";
    const fieldNames = values.map((v) => v.alias);
    const resolvedBlockType = blockType ?? "content";

    // A block's settings live in a separate `settingsData` entry under its own
    // key, and the chained tool addresses blocks by that key — so for a settings
    // edit we must translate the caller's contentKey into the paired
    // settingsKey. Callers only ever have to know the contentKey that
    // inspect-element-blocks reports.
    let targetKey = contentKey;
    if (resolvedBlockType === "settings") {
      const rawValue = (elResult.data.values ?? []).find(
        (v) => v.alias === propertyAlias && (v.culture ?? null) === (culture ?? null) && (v.segment ?? null) === (segment ?? null),
      )?.value;
      const container = isRteWithBlocks(rawValue) ? (rawValue as { blocks: unknown }).blocks : rawValue;
      const settingsKey = findSettingsKey(container, contentKey);
      if (!settingsKey) {
        return createToolResultError(
          `Block ${contentKey} in property "${propertyAlias}" has no settings entry, so its settings cannot be edited. Use inspect-element-blocks to check for a settingsKey, or omit blockType to edit the block's content.`,
        );
      }
      targetKey = settingsKey;
    }

    // `update-element-block-property` types both `updates` and each entry's
    // `properties` as non-empty tuples. Zod's `.min(1)` guarantees the runtime
    // invariant; the assertion carries it into the type.
    const propsTuple = values.map((v) => ({ alias: v.alias, value: v.value })) as [
      { alias: string; value: unknown }, ...{ alias: string; value: unknown }[]
    ];

    const updateResult = await chainCms("update-element-block-property", {
      elementId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      updates: [{
        contentKey: targetKey,
        blockType: resolvedBlockType,
        properties: propsTuple,
      }],
    });
    if (!updateResult.ok) return updateResult.errorResult;

    // `update-element-block-property`'s top-level `success` is always true once
    // the call itself completes — per-block outcomes live only in `results[]`
    // (unknown contentKey, property alias not on the block's element type, …
    // each produce a `results` entry with its own `success: false`). Check that
    // instead of the top-level flag, or a failed write is reported as saved.
    const failed = (updateResult.data.results ?? []).filter((r) => r.success === false);
    if (failed.length > 0) {
      const detail = failed
        .flatMap((r) => (r.errors?.length ? r.errors : [r.message]))
        .join("; ");
      return createToolResultError(
        `Block update failed: ${detail || updateResult.data.message || "no detail returned"}`,
      );
    }

    const target = resolvedBlockType === "settings" ? "settings" : "content";
    const warnings = (updateResult.data.results ?? []).flatMap((r) => r.warnings ?? []);
    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) in block ${target} on element "${elementName}" (saved, not published)`,
      id,
      name: elementName,
      contentKey,
      updatedFields: fieldNames,
      ...(warnings.length ? { warnings } : {}),
    });
  },
};

export default withStandardDecorators(tool);
