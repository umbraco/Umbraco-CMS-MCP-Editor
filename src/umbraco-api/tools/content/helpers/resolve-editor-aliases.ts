/**
 * editorAlias Resolution for create-element (Umbraco-CMS-MCP-Editor#208)
 *
 * `create-document`/`create-and-publish-document`/`create-element` all require
 * an `editorAlias` on every value, resolved from the document (or element)
 * type's property -> its data type's editor alias. The caller (an LLM) only
 * supplies the property alias.
 *
 * Properties inherited through compositions aren't in a document type's own
 * `properties` array, so a value for one of those finds nothing in a
 * properties-only map, silently falls back to `editorAlias: ""`, and gets
 * rejected by Umbraco with an opaque 400. A genuinely wrong or typo'd alias
 * hides behind that same fallback.
 *
 * This resolves every value's editorAlias against the FULL set of own +
 * composition-inherited properties (via resolve-document-type-properties.ts)
 * and fails fast — before any call reaches Umbraco — naming every alias that
 * isn't a property on the document/element type at all.
 *
 * Currently wired into `create-element.ts` only (#208). `create-page.ts` /
 * `create-and-publish-page.ts` have the identical bug (#201) but are fixed
 * separately in #207 — as of this file, they still use their own inline,
 * composition-blind resolution.
 */

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

export type ResolveEditorAliasesResult =
  | { ok: true; values: ResolvedPageValue[] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Resolve `editorAlias` for every value against `documentTypeId`'s own and
 * composition-inherited properties (document types and element types alike —
 * element types are document types with `isElement: true`). Returns a tool
 * error — never a partial resolution — when one or more aliases don't match
 * any property on the type.
 */
export async function resolveEditorAliases(
  documentTypeId: string,
  values: PageValueInput[] | undefined,
): Promise<ResolveEditorAliasesResult> {
  if (!values || values.length === 0) {
    return { ok: true, values: [] };
  }

  const docTypeResult = await resolveDocumentTypeProperties(documentTypeId);
  if (!docTypeResult.ok) return docTypeResult;

  const dataTypeIds = Array.from(
    new Set(
      docTypeResult.properties
        .map((p) => p.dataType?.id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  const editorAliasByDataTypeId = new Map<string, string>();
  if (dataTypeIds.length > 0) {
    const dataTypesResult = await chainCms("get-data-types-by-id-array", { id: dataTypeIds });
    if (!dataTypesResult.ok) return dataTypesResult;
    for (const dt of dataTypesResult.data.items) {
      if (dt.id && dt.editorAlias) editorAliasByDataTypeId.set(dt.id, dt.editorAlias);
    }
  }

  const editorAliasByPropertyAlias = new Map<string, string>();
  for (const prop of docTypeResult.properties) {
    const editorAlias = prop.dataType?.id ? editorAliasByDataTypeId.get(prop.dataType.id) : undefined;
    if (prop.alias && editorAlias) editorAliasByPropertyAlias.set(prop.alias, editorAlias);
  }

  const unresolved = new Set<string>();
  const resolved: ResolvedPageValue[] = values.map((v) => {
    const editorAlias = editorAliasByPropertyAlias.get(v.alias);
    if (!editorAlias) unresolved.add(v.alias);
    return {
      alias: v.alias,
      value: v.value,
      culture: v.culture ?? null,
      segment: v.segment ?? null,
      editorAlias: editorAlias ?? "",
    };
  });

  if (unresolved.size > 0) {
    return {
      ok: false,
      errorResult: createToolResultError(
        `The following value alias(es) are not a property on this document type, own or inherited via composition: ${Array.from(unresolved).join(", ")}. Call get-document-type to see the valid property aliases for this document type.`,
      ),
    };
  }

  return { ok: true, values: resolved };
}
