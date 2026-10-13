/**
 * editorAlias Resolution for create-page / create-and-publish-page
 *
 * `create-document`/`create-and-publish-document` require an `editorAlias` on
 * every value, resolved from the document type's property -> its data type's
 * editor alias. The caller (an LLM) only supplies the property alias.
 *
 * Properties inherited through compositions aren't in a document type's own
 * `properties` array, so a value for one of those used to find nothing in a
 * properties-only map, silently fall back to `editorAlias: ""`, and get
 * rejected by Umbraco with an opaque 400 (Umbraco-CMS-MCP-Editor#201). A
 * genuinely wrong or typo'd alias hid behind that same fallback.
 *
 * This resolves every value's editorAlias against the FULL set of own +
 * composition-inherited properties (via resolve-document-type-properties.ts)
 * and fails fast — before any call reaches Umbraco — naming every alias that
 * isn't a property on the document type at all, separately from an alias
 * that IS a property but whose data type has no resolvable editorAlias. If a
 * composition failed to load and an alias doesn't resolve, that alias might
 * live on the composition we couldn't fetch — the error says so rather than
 * wrongly calling it "not a property".
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
 * composition-inherited properties. Returns a tool error — never a partial
 * resolution — when one or more aliases don't match any property on the
 * document type.
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

  const propertyAliases = new Set(
    docTypeResult.properties.map((p) => p.alias).filter((alias): alias is string => typeof alias === "string"),
  );

  const editorAliasByPropertyAlias = new Map<string, string>();
  for (const prop of docTypeResult.properties) {
    const editorAlias = prop.dataType?.id ? editorAliasByDataTypeId.get(prop.dataType.id) : undefined;
    if (prop.alias && editorAlias) editorAliasByPropertyAlias.set(prop.alias, editorAlias);
  }

  // Two distinct failure modes get two distinct messages: an alias that isn't
  // a property at all (typo, wrong document type) vs. one that IS a property
  // but whose data type has no resolvable editorAlias (a server-side gap,
  // not something the caller can fix by picking a different alias).
  const notAProperty = new Set<string>();
  const missingEditorAlias = new Set<string>();
  const resolved: ResolvedPageValue[] = values.map((v) => {
    const editorAlias = editorAliasByPropertyAlias.get(v.alias);
    if (!editorAlias) {
      if (propertyAliases.has(v.alias)) missingEditorAlias.add(v.alias);
      else notAProperty.add(v.alias);
    }
    return {
      alias: v.alias,
      value: v.value,
      culture: v.culture ?? null,
      segment: v.segment ?? null,
      editorAlias: editorAlias ?? "",
    };
  });

  if (notAProperty.size > 0 || missingEditorAlias.size > 0) {
    const messages: string[] = [];
    if (notAProperty.size > 0) {
      // A composition that failed to load might be exactly where one of
      // these aliases lives — unlike get-document-type (a best-effort read),
      // we can't let that slide here, since calling a real property "not a
      // property" would be actively wrong, not just incomplete.
      if (docTypeResult.failedCompositionIds.length > 0) {
        const failures = docTypeResult.failedCompositionIds
          .map((id, i) => `${id} (${docTypeResult.failedCompositionDetails[i]})`)
          .join(", ");
        messages.push(
          `not found among the resolvable properties on this document type, own or inherited via composition: ${Array.from(notAProperty).join(", ")} — but ${docTypeResult.failedCompositionIds.length} composition(s) could not be loaded: ${failures}, so one of these aliases may actually be valid and just unverifiable right now. Resolve the composition failure(s) above and retry`,
        );
      } else {
        messages.push(
          `not a property on this document type, own or inherited via composition: ${Array.from(notAProperty).join(", ")}`,
        );
      }
    }
    if (missingEditorAlias.size > 0) {
      messages.push(
        `a property on this document type, but its data type has no resolvable editor alias: ${Array.from(missingEditorAlias).join(", ")}`,
      );
    }
    return {
      ok: false,
      errorResult: createToolResultError(
        `The following value alias(es) could not be resolved — ${messages.join("; ")}. Call get-document-type to see the valid property aliases for this document type.`,
      ),
    };
  }

  return { ok: true, values: resolved };
}
