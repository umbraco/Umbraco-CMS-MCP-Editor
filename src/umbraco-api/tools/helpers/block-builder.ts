import { chainCms } from "../../cms-chain.js";
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";

export type BlockValue = { alias: string; value: unknown };

export type Position = {
  mode: "append" | "prepend" | "before" | "after";
  anchorContentKey?: string;
};

type EditorAliasResult =
  | { ok: true; editorAliasByAlias: Map<string, string> }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

export async function resolveBlockEditorAliases(contentTypeKey: string): Promise<EditorAliasResult> {
  const docTypeResult = await chainCms("get-document-type-by-id", { id: contentTypeKey });
  if (!docTypeResult.ok) return { ok: false, errorResult: docTypeResult.errorResult };
  const dataTypeIds = Array.from(new Set(docTypeResult.data.properties.map(p => p.dataType.id)));
  if (dataTypeIds.length === 0) {
    return { ok: true, editorAliasByAlias: new Map() };
  }
  const dataTypesResult = await chainCms("get-data-types-by-id-array", { id: dataTypeIds });
  if (!dataTypesResult.ok) return { ok: false, errorResult: dataTypesResult.errorResult };
  const editorAliasByDataTypeId = new Map(
    dataTypesResult.data.items.map(dt => [dt.id, dt.editorAlias]),
  );
  const editorAliasByAlias = new Map<string, string>();
  for (const prop of docTypeResult.data.properties) {
    const editorAlias = editorAliasByDataTypeId.get(prop.dataType.id);
    if (editorAlias) editorAliasByAlias.set(prop.alias, editorAlias);
  }
  return { ok: true, editorAliasByAlias };
}

export function buildBlockEntry(
  contentKey: string,
  contentTypeKey: string,
  values: ReadonlyArray<BlockValue>,
  editorAliasByAlias: Map<string, string>,
  culture: string | null,
  segment: string | null,
): { key: string; contentTypeKey: string; values: Array<{ editorAlias: string; culture: string | null; segment: string | null; alias: string; value: unknown }> } {
  return {
    key: contentKey,
    contentTypeKey,
    values: values.map(v => ({
      editorAlias: editorAliasByAlias.get(v.alias) ?? "",
      culture,
      segment,
      alias: v.alias,
      value: v.value,
    })),
  };
}

export function insertAtPosition<T>(
  list: ReadonlyArray<T>,
  item: T,
  position: Position,
  matchAnchor: (entry: T) => boolean,
): { ok: true; list: T[] } | { ok: false; reason: "anchor-not-found" } {
  if (position.mode === "append") return { ok: true, list: [...list, item] };
  if (position.mode === "prepend") return { ok: true, list: [item, ...list] };
  const anchorIndex = list.findIndex(matchAnchor);
  if (anchorIndex === -1) return { ok: false, reason: "anchor-not-found" };
  const insertIndex = position.mode === "before" ? anchorIndex : anchorIndex + 1;
  const next = [...list];
  next.splice(insertIndex, 0, item);
  return { ok: true, list: next };
}

export function isBlockListOrGridValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.contentData)
  );
}

export function isRteWithBlocks(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    value.blocks !== null &&
    typeof value.blocks === "object" &&
    Array.isArray(value.blocks?.contentData)
  );
}

export type ExposeEntry = { contentKey: string; culture: string | null; segment: string | null };

export function exposeEntry(contentKey: string, culture: string | null, segment: string | null): ExposeEntry {
  return { contentKey, culture, segment };
}

type BlockContainer = {
  layout?: Record<string, Array<{ contentKey: string; settingsKey?: string }>>;
  contentData?: Array<{ key: string }>;
  settingsData?: Array<{ key: string }>;
  expose?: Array<{ contentKey: string }>;
};

export function removeBlockFromContainer<T extends BlockContainer>(
  container: T,
  contentKey: string,
  layoutKey: string,
  newLayoutList: ReadonlyArray<{ contentKey: string; settingsKey?: string }>,
  doomedSettingsKey: string | undefined,
): T {
  return {
    ...container,
    layout: { ...(container.layout ?? {}), [layoutKey]: [...newLayoutList] },
    contentData: (container.contentData ?? []).filter((entry: { key: string }) => entry.key !== contentKey),
    settingsData: doomedSettingsKey
      ? (container.settingsData ?? []).filter((entry: { key: string }) => entry.key !== doomedSettingsKey)
      : (container.settingsData ?? []),
    expose: (container.expose ?? []).filter((entry: { contentKey: string }) => entry.contentKey !== contentKey),
  };
}
