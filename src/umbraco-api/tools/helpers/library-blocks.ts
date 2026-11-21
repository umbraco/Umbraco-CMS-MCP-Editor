/**
 * Shared lookups for the Library block tools (Umbraco 19 reusable content):
 * `transfer-block-to-library`, `disconnect-block-from-library` and
 * `add-library-block`.
 *
 * A block-bearing property value keeps its blocks in a container
 * (`contentData` + `settingsData` + `layout`). BlockList/BlockGrid carry it at
 * the top level; Rich Text nests it under `blocks`. A Library-linked block has
 * only a layout entry (`isExternalContent: true`, `contentKey` = the Element's
 * id) and no `contentData` entry. These helpers let the tools check the target
 * before prompting or writing, so a bad key fails fast with a clear message.
 */

import { isBlockListOrGridValue, isRteWithBlocks } from "./block-builder.js";

export type BlockEditorKind = "BlockList" | "BlockGrid" | "RichText";

export interface DocumentValue {
  alias: string;
  editorAlias?: string | null;
  culture?: string | null;
  segment?: string | null;
  value?: unknown;
}

export interface LayoutEntry {
  contentKey: string;
  key?: string;
  settingsKey?: string | null;
  isExternalContent?: boolean;
  areas?: Array<{ key?: string; items?: LayoutEntry[] }>;
}

export interface BlockContainer {
  contentData: Array<{ key: string; contentTypeKey: string }>;
  layout?: Record<string, LayoutEntry[]>;
}

/** Find a document property value by alias, matching culture/segment (undefined === null). */
export function findPropertyValue(
  values: ReadonlyArray<DocumentValue>,
  propertyAlias: string,
  culture?: string | null,
  segment?: string | null,
): DocumentValue | undefined {
  return values.find(
    (v) => v.alias === propertyAlias &&
      (v.culture ?? null) === (culture ?? null) &&
      (v.segment ?? null) === (segment ?? null),
  );
}

/** The block container of a property value, plus which editor holds it. Null when the value has no blocks. */
export function getBlockContainer(
  value: unknown,
  editorAlias?: string | null,
): { kind: BlockEditorKind; container: BlockContainer } | null {
  if (isRteWithBlocks(value)) {
    return { kind: "RichText", container: (value as { blocks: BlockContainer }).blocks };
  }
  if (isBlockListOrGridValue(value)) {
    const layout = (value as BlockContainer).layout ?? {};
    const kind: BlockEditorKind = editorAlias === "Umbraco.BlockGrid" || "Umbraco.BlockGrid" in layout
      ? "BlockGrid"
      : "BlockList";
    return { kind, container: value as BlockContainer };
  }
  return null;
}

/**
 * Find a layout entry by its contentKey or its own layout key, walking
 * BlockGrid `areas[].items[]`. Mirrors the chained CMS tools' lookup.
 */
export function findLayoutEntry(container: BlockContainer, key: string): LayoutEntry | undefined {
  const walk = (entries: LayoutEntry[] | undefined): LayoutEntry | undefined => {
    for (const entry of entries ?? []) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.contentKey === key || (entry.key !== undefined && entry.key === key)) return entry;
      for (const area of entry.areas ?? []) {
        const found = walk(area?.items);
        if (found) return found;
      }
    }
    return undefined;
  };
  for (const entries of Object.values(container.layout ?? {})) {
    const found = walk(entries);
    if (found) return found;
  }
  return undefined;
}
