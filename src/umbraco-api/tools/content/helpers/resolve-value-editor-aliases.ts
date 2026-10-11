import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { resolveDocumentTypeProperties } from "./resolve-document-type-properties.js";

export interface PageValueInput {
  alias: string;
  value: unknown;
  culture?: string | null;
  segment?: string | null;
}

export interface ResolvedPageValue {
  alias: string;
  value: unknown;
  culture: string | null;
  segment: string | null;
  editorAlias: string;
}

export type ResolveValueEditorAliasesResult =
  | { ok: true; values: ResolvedPageValue[] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Resolve each value's `editorAlias` — required by create-document /
 * create-and-publish-document — from the document type's own and
 * composition-inherited properties (see resolveDocumentTypeProperties).
 *
 * A value whose alias isn't a property on the document type at all, own or
 * inherited — whether because it's genuinely wrong/typo'd, or because it's a
 * composition-inherited alias we previously failed to resolve — fails here
 * with a clear, pre-flight error instead of being sent to Umbraco with
 * editorAlias: "", which comes back as an opaque 400.
 */
export async function resolveValueEditorAliases(
  documentTypeId: string,
  values: PageValueInput[] | undefined,
): Promise<ResolveValueEditorAliasesResult> {
  if (!values || values.length === 0) {
    return { ok: true, values: [] };
  }

  const propsResult = await resolveDocumentTypeProperties(documentTypeId);
  if (!propsResult.ok) return propsResult;

  const dataTypeIdByPropertyAlias = new Map<string, string>();
  for (const prop of propsResult.properties) {
    if (prop.alias && prop.dataType?.id) {
      dataTypeIdByPropertyAlias.set(prop.alias, prop.dataType.id);
    }
  }

  const dataTypeIds = Array.from(new Set(Array.from(dataTypeIdByPropertyAlias.values())));
  const editorAliasByDataTypeId = new Map<string, string>();
  if (dataTypeIds.length > 0) {
    const dataTypesResult = await chainCms("get-data-types-by-id-array", { id: dataTypeIds });
    if (!dataTypesResult.ok) return { ok: false, errorResult: dataTypesResult.errorResult };
    for (const dt of dataTypesResult.data.items) {
      editorAliasByDataTypeId.set(dt.id, dt.editorAlias);
    }
  }

  const unresolvedAliases: string[] = [];
  const resolvedValues: ResolvedPageValue[] = values.map((v) => {
    const dataTypeId = dataTypeIdByPropertyAlias.get(v.alias);
    const editorAlias = dataTypeId ? editorAliasByDataTypeId.get(dataTypeId) : undefined;
    if (!editorAlias) unresolvedAliases.push(v.alias);
    return {
      alias: v.alias,
      value: v.value,
      culture: v.culture ?? null,
      segment: v.segment ?? null,
      editorAlias: editorAlias ?? "",
    };
  });

  if (unresolvedAliases.length > 0) {
    const unique = Array.from(new Set(unresolvedAliases));
    const noun = unique.length === 1 ? "alias isn't" : "aliases aren't";
    return {
      ok: false,
      errorResult: createToolResultError(
        `The following ${noun} a property on this document type (own or inherited via composition): ${unique.join(", ")}. Call get-document-type to see the valid property aliases.`,
      ),
    };
  }

  return { ok: true, values: resolvedValues };
}
