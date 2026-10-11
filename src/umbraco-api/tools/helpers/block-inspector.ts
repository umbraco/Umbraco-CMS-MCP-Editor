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

/** Cap on how many `availableBlocks` entries get enriched/returned — a page
 * with a huge block tree shouldn't dump hundreds of entries into an error. */
const MAX_ENRICHED_BLOCKS = 50;

/** Cap on how many levels of block-in-block nesting `collectBlockEntryTypes`
 * will descend into — comfortably covers any real-world block tree, and bounds
 * the walk's cost against a pathologically deep (but still JSON-finite, so
 * never cyclic) nested structure before it reaches `availableBlocks`'s own
 * output cap. Same guard-a-tree-walk convention as `report-site-tree-summary`'s
 * `maxDepth`. */
const MAX_BLOCK_WALK_DEPTH = 20;

interface BlockDataContainer {
  contentData?: unknown[];
  settingsData?: unknown[];
}

/**
 * Enrich a "Blocks not found" error from `update-block-property` /
 * `update-element-block-property` with each available block's
 * `contentTypeKey`, cross-referenced from the already-fetched entity's raw
 * property values. The chained tool's `availableBlocks` extension only lists
 * `{key, type, path}` — no element-type information — so the model can't tell
 * which key is which kind of block without an extra lookup. Both `edit-block`
 * and `bulk-set-block-property` already have the document fetched by the time
 * they see this error, so this is a free enrichment rather than a new chained
 * call.
 *
 * Walks both `contentData` and `settingsData` (a block's settings live in a
 * separate entry with its own key) and recurses into any block-in-block
 * property, so a settings key or a nested block's key resolves too — not just
 * top-level content blocks.
 *
 * Returns the error result unchanged when it isn't this specific shape (no
 * `availableBlocks` array in its ProblemDetails) — e.g. "Property not found",
 * which is left as-is per the issue's scope.
 */
export function enrichBlockNotFoundError(
  errorResult: ReturnType<typeof createToolResultError>,
  values: ReadonlyArray<WalkableValue>,
  options: { propertyAlias?: string; note?: string } = {},
): ReturnType<typeof createToolResultError> {
  const problem = extractInnerProblemDetails(errorResult as Record<string, unknown>);
  const availableBlocks = problem.availableBlocks;
  if (!Array.isArray(availableBlocks)) return errorResult;

  const { propertyAlias, note } = options;
  const filtered = propertyAlias ? values.filter((v) => v.alias === propertyAlias) : values;
  const typeByKey = new Map<string, string>();
  for (const v of filtered) {
    const container = isRteWithBlocks(v.value) ? (v.value as { blocks: unknown }).blocks : v.value;
    if (isBlockListOrGridValue(container)) {
      collectBlockEntryTypes(container as BlockDataContainer, typeByKey, 0);
    }
  }

  const truncated = availableBlocks.length > MAX_ENRICHED_BLOCKS;
  const limitedBlocks = truncated ? availableBlocks.slice(0, MAX_ENRICHED_BLOCKS) : availableBlocks;
  const enrichedBlocks = limitedBlocks.map((b) =>
    b && typeof b === "object" && typeof (b as { key?: unknown }).key === "string"
      ? { ...b, contentTypeKey: typeByKey.get((b as { key: string }).key) ?? null }
      : b,
  );

  return createToolResultError({
    ...problem,
    availableBlocks: enrichedBlocks,
    ...(truncated
      ? { availableBlocksNote: `Showing ${MAX_ENRICHED_BLOCKS} of ${availableBlocks.length} available blocks — use inspect-blocks for the full list.` }
      : {}),
    ...(note ? { note } : {}),
  });
}

/**
 * Recursively collect every block entry's key → contentTypeKey across a
 * BlockList/BlockGrid container's content AND settings data, descending into
 * any block-in-block property so a nested block's type is found too. A
 * block's settings live in a separate `settingsData` array under their own
 * key, and a block can itself carry a block-bearing property, so a walk of
 * top-level `contentData` alone misses both.
 *
 * `depth` bounds the recursion at `MAX_BLOCK_WALK_DEPTH` — the parsed JSON
 * this walks can't be cyclic, but it can in principle nest block-in-block
 * arbitrarily deep, and this runs synchronously on every "Blocks not found"
 * error, so an unbounded walk would be a real cost on a pathological document.
 */
function collectBlockEntryTypes(container: BlockDataContainer, into: Map<string, string>, depth: number): void {
  if (depth > MAX_BLOCK_WALK_DEPTH) return;
  for (const list of [container.contentData, container.settingsData]) {
    if (!Array.isArray(list)) continue;
    for (const block of list) {
      if (!block || typeof block !== "object") continue;
      const key = (block as { key?: unknown }).key;
      const contentTypeKey = (block as { contentTypeKey?: unknown }).contentTypeKey;
      if (typeof key === "string" && typeof contentTypeKey === "string") into.set(key, contentTypeKey);

      const nestedValues = (block as { values?: unknown }).values;
      if (!Array.isArray(nestedValues)) continue;
      for (const nested of nestedValues as Array<{ value?: unknown }>) {
        const nestedRaw = nested?.value;
        const nestedContainer = isRteWithBlocks(nestedRaw) ? (nestedRaw as { blocks: unknown }).blocks : nestedRaw;
        if (isBlockListOrGridValue(nestedContainer)) {
          collectBlockEntryTypes(nestedContainer as BlockDataContainer, into, depth + 1);
        }
      }
    }
  }
}

/** Attach each block's paired settings key, where the layout wires one up. */
function withSettingsKeys(blocks: InspectedBlock[], container: unknown): InspectedBlock[] {
  return blocks.map((block) => {
    const settingsKey = findSettingsKey(container, block.contentKey);
    return settingsKey ? { ...block, settingsKey } : block;
  });
}

/** A single per-block/per-update result entry, as returned by the chained
 * `update-block-property` / `update-element-block-property` tools. */
export interface BlockUpdateResultEntry {
  success: boolean;
  message: string;
  updatedCount?: number;
  addedCount?: number;
  warnings?: string[];
  errors?: string[];
}

export type BlockUpdateOutcome = "clean" | "partial" | "failed";

export interface BlockUpdateClassification {
  /** "clean": every requested property was written. "partial": some were,
   * some weren't. "failed": nothing was written at all. */
  outcome: BlockUpdateOutcome;
  /** Sum of `updatedCount`/`addedCount` across every result — the only
   * reliable signal of what was actually written to the document. */
  processedCount: number;
  /** How many of the result entries individually wrote at least one property. */
  updatedEntryCount: number;
  /** Combined errors + warnings + per-entry messages, for reporting. */
  detail: string;
  /** Warnings across every result, for passing through to the caller even on
   * an otherwise-clean outcome. */
  warnings: string[];
}

/**
 * Classify a chained `update-block-property` / `update-element-block-property`
 * call's `results[]` against how many properties were actually requested.
 *
 * Upstream marks a result `success: true` whenever
 * `totalProcessed > 0 || errors.length === 0` — so `success`/`errors` alone
 * can't be trusted to tell a clean write from a partial or even a fully failed
 * one: a result with one saved alias and one invalid one still reads
 * `success: true` with `errors` populated, and a result where nothing was
 * processed and no error was recorded either (e.g. the alias only produced a
 * `warnings` entry because the block's element type couldn't be resolved)
 * still reads `success: true, errors: []`. Comparing the actual processed
 * count against how many properties were requested is the only check that
 * catches all of these — including the case where the chained tool returns
 * fewer result entries than blocks were requested, which silently lowers
 * `processedCount` below `requestedCount` the same way a per-property failure
 * would.
 */
export function classifyBlockUpdateResults(
  results: ReadonlyArray<BlockUpdateResultEntry> | undefined,
  requestedCount: number,
): BlockUpdateClassification {
  const list = results ?? [];
  const processedCount = list.reduce((sum, r) => sum + (r.updatedCount ?? 0) + (r.addedCount ?? 0), 0);
  const updatedEntryCount = list.filter((r) => (r.updatedCount ?? 0) + (r.addedCount ?? 0) > 0).length;
  const errors = list.flatMap((r) => r.errors ?? []);
  const warnings = list.flatMap((r) => r.warnings ?? []);
  const detail = [...errors, ...warnings].join("; ")
    || list.map((r) => r.message).filter(Boolean).join("; ")
    || "no detail returned";
  const outcome: BlockUpdateOutcome =
    processedCount === 0 ? "failed" : processedCount < requestedCount ? "partial" : "clean";
  return { outcome, processedCount, updatedEntryCount, detail, warnings };
}
