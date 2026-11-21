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
  contentData: Array<{ key: string; contentTypeKey: string; values?: BlockDataValue[] }>;
  expose?: Array<{ contentKey: string; culture?: string | null; segment?: string | null }>;
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

/** A block's values, as stored in a container's `contentData` entry. */
export interface BlockDataValue {
  alias: string;
  culture?: string | null;
  segment?: string | null;
  value?: unknown;
}

const holdsData = (value: unknown) =>
  value !== null && value !== undefined && value !== "" && value !== false &&
  !(Array.isArray(value) && value.length === 0);

/**
 * The culture of every value in a block that holds data (`null` for shared,
 * invariant data). Mirrors the back office's `#getValueCultures`, which feeds
 * both the language-access check and the cultures the new Element gets.
 */
export function blockValueCultures(values: ReadonlyArray<BlockDataValue>): Array<string | null> {
  return values.filter((v) => holdsData(v.value)).map((v) => v.culture ?? null);
}

/** The current user's language access, as returned by `get-user-current`. */
export interface LanguageAccess {
  hasAccessToAllLanguages: boolean;
  languages: string[];
  hasAccessToInvariantForVariant: boolean;
}

/**
 * The parts of a block the user may not transfer to the Library — a port of the
 * back office's `umbGetBlockedTransferVariants` (block/utils/
 * block-transfer-variants.function.ts in Umbraco 19). The back office refuses a
 * transfer when either list is non-empty, because the new Element would carry
 * content the user isn't allowed to edit. The chained CMS tool doesn't check
 * this, so the editor tool does.
 */
export function getBlockedTransferVariants(args: {
  valueCultures: Array<string | null>;
  variesByCulture: boolean;
  access: LanguageAccess;
}): { cultures: string[]; invariant: boolean } {
  const allowed = (culture: string) => args.access.hasAccessToAllLanguages || args.access.languages.includes(culture);
  const cultures = [...new Set(args.valueCultures.filter((c): c is string => c !== null))].filter((c) => !allowed(c));
  const invariant = args.variesByCulture && args.valueCultures.includes(null) && !args.access.hasAccessToInvariantForVariant;
  return { cultures, invariant };
}

/** An Element variant's publish state, keyed by culture (`null` for an invariant Element). */
export interface ElementVariantState {
  culture: string | null;
  name: string;
  state: string;
}

export const isPublishedState = (state: string | undefined) =>
  state === "Published" || state === "PublishedPendingChanges";

/** Summarise an Element's variants for output: culture, name, publish state. */
export function elementVariantStates(
  variants: ReadonlyArray<{ culture?: string | null; name: string; state: string }> | undefined,
): ElementVariantState[] {
  return (variants ?? []).map((v) => ({ culture: v.culture ?? null, name: v.name, state: v.state }));
}

/**
 * Which of `cultures` an Element is NOT published in. For an invariant Element
 * (a single `culture: null` variant) the one variant's state applies to every
 * culture. Used to warn that a Library block won't render in those languages.
 */
export function unpublishedCulturesOf(variants: ElementVariantState[], cultures: Array<string | null>): Array<string | null> {
  const invariant = variants.find((v) => v.culture === null);
  if (invariant) return isPublishedState(invariant.state) ? [] : cultures;
  return cultures.filter((c) => !variants.some((v) => v.culture === c && isPublishedState(v.state)));
}
