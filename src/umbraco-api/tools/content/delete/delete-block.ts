import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { isBlockListOrGridValue, isRteWithBlocks, removeBlockFromContainer } from "../../helpers/block-builder.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the block property"),
  propertyAlias: z.string().describe("The document property alias holding the block (e.g. 'mainContent'). Use inspect-blocks to find this."),
  contentKey: z.string().uuid().describe("The unique key of the block to remove. Use inspect-blocks to find this."),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string(),
});

type GridLayoutItem = {
  contentKey: string;
  settingsKey?: string;
  columnSpan?: number;
  rowSpan?: number;
  areas?: Array<{ key: string; items: GridLayoutItem[] }>;
};

function findAndRemoveGridItem(
  items: GridLayoutItem[],
  contentKey: string,
): { found: true; doomedSettingsKey: string | undefined; nextItems: GridLayoutItem[] } | { found: false } {
  const idx = items.findIndex(item => item.contentKey === contentKey);
  if (idx !== -1) {
    return { found: true, doomedSettingsKey: items[idx].settingsKey, nextItems: items.filter((_, i) => i !== idx) };
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!Array.isArray(item.areas)) continue;
    for (let aIdx = 0; aIdx < item.areas.length; aIdx++) {
      const inner = findAndRemoveGridItem(item.areas[aIdx].items ?? [], contentKey);
      if (inner.found) {
        const updatedAreas = item.areas.slice();
        updatedAreas[aIdx] = { ...item.areas[aIdx], items: inner.nextItems };
        const nextItems = items.slice();
        nextItems[i] = { ...item, areas: updatedAreas };
        return { found: true, doomedSettingsKey: inner.doomedSettingsKey, nextItems };
      }
    }
  }
  return { found: false };
}

type RemovalPlan =
  | { ok: true; newValue: unknown; confirmMessage: string }
  | { ok: false; errorText: string };

function planRemoval(
  propValue: any,
  editorAlias: string | null | undefined,
  propertyAlias: string,
  contentKey: string,
  pageName: string,
): RemovalPlan {
  const notFound: RemovalPlan = { ok: false, errorText: `Block '${contentKey}' was not found in property '${propertyAlias}'.` };
  const draftSuffix = "Will be saved as a draft, not published.";

  if (isBlockListOrGridValue(propValue) && editorAlias === "Umbraco.BlockList") {
    const layoutKey = "Umbraco.BlockList";
    const layoutList: Array<{ contentKey: string; settingsKey?: string }> = propValue.layout?.[layoutKey] ?? [];
    const doomed = layoutList.find(e => e.contentKey === contentKey);
    if (!doomed) return notFound;
    return {
      ok: true,
      newValue: removeBlockFromContainer(propValue, contentKey, layoutKey, layoutList.filter(e => e.contentKey !== contentKey), doomed.settingsKey),
      confirmMessage: `Remove block ${contentKey} from "${pageName}" (BlockList ${propertyAlias})? ${draftSuffix}`,
    };
  }

  if (isBlockListOrGridValue(propValue) && editorAlias === "Umbraco.BlockGrid") {
    const layoutKey = "Umbraco.BlockGrid";
    const removed = findAndRemoveGridItem(propValue.layout?.[layoutKey] ?? [], contentKey);
    if (!removed.found) return notFound;
    // Nested-area cascade is intentionally out of scope: if the doomed block has child
    // areas with their own blocks, those nested contentData rows are left in place rather
    // than recursively removed. Single-block primitive only — bulk/cascade comes later.
    return {
      ok: true,
      newValue: removeBlockFromContainer(propValue, contentKey, layoutKey, removed.nextItems, removed.doomedSettingsKey),
      confirmMessage: `Remove block ${contentKey} from "${pageName}" (BlockGrid ${propertyAlias})? ${draftSuffix}`,
    };
  }

  if (isRteWithBlocks(propValue)) {
    const layoutKey = "Umbraco.RichText";
    const blocks = propValue.blocks;
    const layoutList: Array<{ contentKey: string; settingsKey?: string }> = blocks.layout?.[layoutKey] ?? [];
    const inContent = (blocks.contentData ?? []).some((e: any) => e.key === contentKey);
    if (!inContent) return notFound;
    const doomedSettingsKey = layoutList.find(e => e.contentKey === contentKey)?.settingsKey;
    const tagRe = new RegExp(`<umb-rte-block[^>]*data-content-key="${contentKey}"[^>]*>\\s*</umb-rte-block>`, "gi");
    return {
      ok: true,
      newValue: {
        ...propValue,
        markup: (propValue.markup ?? "").replace(tagRe, ""),
        blocks: removeBlockFromContainer(blocks, contentKey, layoutKey, layoutList.filter(e => e.contentKey !== contentKey), doomedSettingsKey),
      },
      confirmMessage: `Remove block ${contentKey} from a Rich Text in "${pageName}" (${propertyAlias})? ${draftSuffix}`,
    };
  }

  return { ok: false, errorText: `Property '${propertyAlias}' on '${pageName}' is not a block-bearing property (BlockList, BlockGrid, or Rich Text with blocks). Use inspect-blocks to confirm.` };
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-block",
  description: "Remove a single block from a BlockList, BlockGrid, or Rich Text property on a page. Supply the page ID, the property alias, and the block's contentKey — use inspect-blocks first to find these. The change is saved as a draft, NOT published. You will be asked to confirm before removing.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id, propertyAlias, contentKey, culture, segment }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";

    const prop = (doc.values ?? []).find(
      v => v.alias === propertyAlias &&
        (v.culture ?? null) === (culture ?? null) &&
        (v.segment ?? null) === (segment ?? null),
    );
    if (!prop) {
      return createToolResultError({
        content: [{ type: "text", text: `Property '${propertyAlias}' not found on page '${pageName}'. Use inspect-blocks to see available properties.` }],
        isError: true,
      });
    }

    const plan = planRemoval(prop.value, prop.editorAlias, propertyAlias, contentKey, pageName);
    if (!plan.ok) {
      return createToolResultError({ content: [{ type: "text", text: plan.errorText }], isError: true });
    }

    if (!await requestApproval(extra, plan.confirmMessage)) {
      return createToolResultError({ content: [{ type: "text", text: "Cancelled by user." }], isError: true });
    }

    const updateResult = await chainCms("update-document-properties", {
      id,
      properties: [{ alias: propertyAlias, value: plan.newValue, culture: culture ?? null, segment: segment ?? null }],
    });
    if (!updateResult.ok) return updateResult.errorResult;

    return createToolResult({
      message: `Removed block from "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      contentKey,
    });
  },
};

export default withStandardDecorators(tool);
