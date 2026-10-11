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
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { extractInnerProblemDetails } from "../../cms-chain.js";
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

/**
 * Enrich a "Blocks not found" error from `update-block-property` /
 * `update-element-block-property` with each available block's
 * `contentTypeKey`, cross-referenced from the already-fetched document's raw
 * property values for the targeted property. The chained tool's
 * `availableBlocks` extension only lists `{key, type, path}` — no
 * element-type information — so the model can't tell which key is which kind
 * of block without an extra lookup. `edit-block` and `bulk-set-block-property`
 * already have the document fetched by the time they see this error, so this
 * is a free enrichment rather than a new chained call.
 *
 * The lookup walks both `contentData` and `settingsData`, and recurses into
 * nested blocks, because the chained tool's own discovery does the same —
 * `availableBlocks` can include settings entries and blocks nested inside
 * another block's properties, which a contentData-only lookup would report as
 * `contentTypeKey: null`.
 *
 * Returns the error result unchanged when it isn't this specific shape (no
 * `availableBlocks` array in its ProblemDetails) — e.g. "Property not found",
 * which is left as-is per the issue's scope.
 */
export function enrichBlockNotFoundError(
  errorResult: ReturnType<typeof createToolResultError>,
  values: ReadonlyArray<WalkableValue>,
  propertyAlias: string,
  options: { noteSettingsKeys?: boolean } = {},
): ReturnType<typeof createToolResultError> {
  const problem = extractInnerProblemDetails(errorResult as Record<string, unknown>);
  const availableBlocks = problem.availableBlocks;
  if (!Array.isArray(availableBlocks)) return errorResult;

  const typeByKey = new Map<string, string>();
  for (const v of values) {
    if (v.alias !== propertyAlias) continue;
    const value = v.value as { blocks?: unknown } | undefined;
    const container = isRteWithBlocks(value) ? value!.blocks : value;
    collectContentTypeKeysByBlockKey(container, typeByKey);
  }

  const enrichedBlocks = availableBlocks.map((b) =>
    b && typeof b === "object" && typeof (b as { key?: unknown }).key === "string"
      ? { ...b, contentTypeKey: typeByKey.get((b as { key: string }).key) ?? null }
      : b,
  );

  const truncated = enrichedBlocks.length > MAX_ENRICHED_BLOCKS;
  const cappedBlocks = truncated ? enrichedBlocks.slice(0, MAX_ENRICHED_BLOCKS) : enrichedBlocks;

  const notes: string[] = [];
  if (truncated) {
    notes.push(`Showing the first ${MAX_ENRICHED_BLOCKS} of ${enrichedBlocks.length} available blocks — use inspect-blocks for the full list.`);
  }
  if (options.noteSettingsKeys) {
    notes.push(`Entries with type "settings" are a block's settings key — pass one as contentKey only together with blockType: "settings"; use the matching "content" entry's key to edit the block itself.`);
  }

  return createToolResultError({
    ...problem,
    availableBlocks: cappedBlocks,
    ...(notes.length ? { note: notes.join(" ") } : {}),
  });
}

/** Attach each block's paired settings key, where the layout wires one up. */
function withSettingsKeys(blocks: InspectedBlock[], container: unknown): InspectedBlock[] {
  return blocks.map((block) => {
    const settingsKey = findSettingsKey(container, block.contentKey);
    return settingsKey ? { ...block, settingsKey } : block;
  });
}

/** A single block's per-block outcome from `update-block-property` / `update-element-block-property`. */
export interface BlockUpdateResultEntry {
  success: boolean;
  message: string;
  updatedCount?: number;
  addedCount?: number;
  warnings?: string[];
  errors?: string[];
}

/**
 * Split a chained block-update call's `results[]` into the entries that got
 * nothing written versus everything else, and flatten the errors/warnings
 * across all entries. Umbraco sets `success: totalProcessed > 0 ||
 * errors.length === 0`, so `success` is only ever `false` when NOTHING on
 * that entry was processed — an entry with `success: true` can still carry
 * `errors` (some of its properties were valid and saved, one wasn't), so
 * callers must not treat "no hard failures" as "nothing went wrong": check
 * `errors.length` too.
 */
export function splitBlockUpdateResults(results: ReadonlyArray<BlockUpdateResultEntry> | undefined | null): {
  hardFailed: BlockUpdateResultEntry[];
  errors: string[];
  warnings: string[];
} {
  const list = results ?? [];
  return {
    hardFailed: list.filter((r) => r.success !== true),
    errors: list.flatMap((r) => r.errors ?? []),
    warnings: list.flatMap((r) => r.warnings ?? []),
  };
}

/**
 * Recursively collect every block's `contentKey -> contentTypeKey` pairing
 * across a block-bearing value's full structure: its own `contentData` AND
 * `settingsData`, plus any block nested inside a block's own property values
 * (Umbraco's nested-blocks feature — a block's property can itself be a
 * BlockList/BlockGrid value). This mirrors the chained CMS tool's own block
 * discovery, which is what "Blocks not found"'s `availableBlocks` extension
 * lists — so the enrichment below can label every block it lists, not just
 * top-level content blocks.
 */
function collectContentTypeKeysByBlockKey(container: unknown, out: Map<string, string> = new Map()): Map<string, string> {
  if (!container || typeof container !== "object") return out;
  const c = container as { contentData?: unknown[]; settingsData?: unknown[] };
  for (const block of [...(c.contentData ?? []), ...(c.settingsData ?? [])]) {
    if (!block || typeof block !== "object") continue;
    const b = block as { key?: unknown; contentTypeKey?: unknown; values?: unknown };
    if (typeof b.key === "string" && typeof b.contentTypeKey === "string") {
      out.set(b.key, b.contentTypeKey);
    }
    if (Array.isArray(b.values)) {
      for (const prop of b.values as Array<{ value?: unknown }>) {
        const value = prop?.value;
        const nested = isRteWithBlocks(value) ? (value as { blocks: unknown }).blocks : isBlockListOrGridValue(value) ? value : undefined;
        if (nested) collectContentTypeKeysByBlockKey(nested, out);
      }
    }
  }
  return out;
}

/** Cap on the number of blocks `enrichBlockNotFoundError` lists, to bound the response on a property with many blocks. */
const MAX_ENRICHED_BLOCKS = 50;
