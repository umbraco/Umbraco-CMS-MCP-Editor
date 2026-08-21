/**
 * Shared block-inspection primitives.
 *
 * `inspect-blocks` (documents) and `inspect-element-blocks` (Library elements)
 * present the same view over the same underlying value shapes — a BlockList /
 * BlockGrid value carries `contentData`, an RTE-with-blocks value nests the same
 * array under `blocks.contentData`. Only the entity fetched and the surrounding
 * output differ (documents carry a `previewUrl`, elements do not).
 *
 * The walk, the output schema for the block tree, and the shape predicates live
 * here so the two tools stay in lockstep. Predicates are re-exported from
 * `block-builder.ts`, which already owned them for the add/delete block tools.
 */

import { z } from "zod";
import { isBlockListOrGridValue, isRteWithBlocks } from "./block-builder.js";

export { isBlockListOrGridValue, isRteWithBlocks };

/** A single block's flattened property. */
export interface InspectedBlockProperty {
  alias: string;
  value: unknown;
}

/** A block found inside a block-bearing property. */
export interface InspectedBlock {
  contentKey: string;
  contentTypeKey: string;
  /** Present only when the block's layout entry wires up a settings entry. */
  settingsKey?: string;
  properties: InspectedBlockProperty[];
}

/** A block-bearing property together with the blocks it contains. */
export interface InspectedBlockContainer {
  propertyAlias: string;
  editorAlias?: string;
  blocks: InspectedBlock[];
}

/**
 * Output schema for the block tree, shared by both inspect tools so their
 * responses are structurally identical. `editTool` names the tool that consumes
 * `contentKey` for the entity in question (`edit-block` for documents,
 * `edit-element-block` for elements) so the description steers the LLM to the
 * right one.
 */
export function blockPropertiesSchema(editTool: string) {
  return z.array(z.object({
    propertyAlias: z.string().describe("The property containing these blocks"),
    editorAlias: z.string().optional(),
    blocks: z.array(z.object({
      contentKey: z.string().describe(`The block's unique key — use this with ${editTool}`),
      contentTypeKey: z.string().describe("The block's element type ID"),
      settingsKey: z.string().optional().describe("The key of the block's settings entry. Absent when the block has no settings."),
      properties: z.array(z.object({
        alias: z.string(),
        value: z.any(),
      })),
    })),
  }));
}

/** Flatten a `contentData` array into the inspected-block shape. */
export function extractBlocks(contentData: unknown[]): InspectedBlock[] {
  return contentData.map((block: any) => ({
    contentKey: block?.key ?? "",
    contentTypeKey: block?.contentTypeKey ?? "",
    properties: Array.isArray(block?.values)
      ? block.values.map((v: any) => ({ alias: v?.alias ?? "", value: v?.value }))
      : [],
  }));
}

/**
 * Find the settings entry key paired with a block's content key.
 *
 * A block's settings live in a *separate* `settingsData` entry with its own key;
 * the pairing is only recorded in the layout (`{ contentKey, settingsKey }`).
 * BlockGrid nests layout entries inside `areas[].items[]`, so the search walks
 * every layout list recursively rather than assuming a flat array.
 *
 * Returns undefined when the block has no settings entry.
 */
export function findSettingsKey(container: unknown, contentKey: string): string | undefined {
  const layout = (container as { layout?: Record<string, unknown> } | null)?.layout;
  if (!layout || typeof layout !== "object") return undefined;
  return searchLayout(Object.values(layout), contentKey);
}

function searchLayout(entries: unknown[], contentKey: string): string | undefined {
  for (const entry of entries) {
    if (Array.isArray(entry)) {
      const found = searchLayout(entry, contentKey);
      if (found) return found;
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { contentKey?: string; settingsKey?: unknown; areas?: unknown[]; items?: unknown[] };
    if (candidate.contentKey === contentKey) {
      return typeof candidate.settingsKey === "string" && candidate.settingsKey.length > 0
        ? candidate.settingsKey
        : undefined;
    }
    for (const nested of [candidate.areas, candidate.items]) {
      if (Array.isArray(nested)) {
        const found = searchLayout(nested, contentKey);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/** A property value as returned by get-document-by-id / get-element-by-id. */
export interface WalkableValue {
  alias: string;
  editorAlias?: string | null;
  value?: unknown;
}

/**
 * Walk an entity's property values and return only those that carry blocks,
 * flattened. Pass `propertyAlias` to restrict the walk to a single property.
 *
 * RTE-with-blocks values are reported with editorAlias `Umbraco.RichText` even
 * when the payload omits it, since the blocks live under `blocks.contentData`
 * rather than at the top level and callers branch on that.
 */
export function collectBlockProperties(
  values: ReadonlyArray<WalkableValue>,
  propertyAlias?: string,
): InspectedBlockContainer[] {
  const filtered = propertyAlias
    ? values.filter((v) => v.alias === propertyAlias)
    : values;

  return filtered
    .filter((v) => isBlockListOrGridValue(v.value) || isRteWithBlocks(v.value))
    .map((v) => {
      const value = v.value as { contentData?: unknown[]; blocks?: { contentData?: unknown[] } };
      // RTE-with-blocks nests the block container (contentData + layout) one
      // level down under `blocks`; BlockList/BlockGrid carry it at the top.
      const container = isRteWithBlocks(value) ? value.blocks! : value;
      return {
        propertyAlias: v.alias,
        editorAlias: isRteWithBlocks(value) ? "Umbraco.RichText" : (v.editorAlias ?? undefined),
        blocks: withSettingsKeys(extractBlocks(container.contentData!), container),
      };
    });
}

/** Attach each block's paired settings key, where the layout wires one up. */
function withSettingsKeys(blocks: InspectedBlock[], container: unknown): InspectedBlock[] {
  return blocks.map((block) => {
    const settingsKey = findSettingsKey(container, block.contentKey);
    return settingsKey ? { ...block, settingsKey } : block;
  });
}
