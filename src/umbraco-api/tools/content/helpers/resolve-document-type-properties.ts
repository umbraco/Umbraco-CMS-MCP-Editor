import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

export interface RawDocTypeProperty {
  alias?: string;
  name?: string;
  description?: string | null;
  dataType?: { id?: string };
  variesByCulture?: boolean;
  variesBySegment?: boolean;
}

export interface RawDocType {
  id?: string;
  alias?: string;
  name?: string;
  description?: string | null;
  variesByCulture?: boolean;
  variesBySegment?: boolean;
  properties?: RawDocTypeProperty[];
  compositions?: { document?: { id?: string }; documentType?: { id?: string }; id?: string; compositionType?: string }[];
}

export type ResolveDocumentTypePropertiesResult =
  | { ok: true; docType: RawDocType; properties: RawDocTypeProperty[] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Fetch a document type by id and merge its own properties with every
 * property inherited via composition. A document type's own `properties`
 * list is often empty or partial — properties are commonly defined once on a
 * shared composition doc type (e.g. shared SEO fields) rather than directly
 * on the type being read/created/edited — so any caller that needs "every
 * property an editor can actually set on this doc type" needs this merged
 * list, not a single get-document-type-by-id call's own `properties`.
 *
 * Shared by get-document-type.ts (listing properties for editors) and the
 * create-page / create-and-publish-page editorAlias resolution — edit this
 * helper rather than re-inlining the composition walk so both stay in
 * lockstep.
 */
export async function resolveDocumentTypeProperties(
  documentTypeId: string,
): Promise<ResolveDocumentTypePropertiesResult> {
  const result = await chainCms("get-document-type-by-id", { id: documentTypeId });
  if (!result.ok) return { ok: false, errorResult: result.errorResult };
  const data = result.data as RawDocType;

  const collected = new Map<string, RawDocTypeProperty>();

  function addProperties(props: RawDocTypeProperty[]): void {
    for (const p of props) {
      if (p.alias && !collected.has(p.alias)) {
        collected.set(p.alias, p);
      }
    }
  }

  addProperties(Array.isArray(data.properties) ? data.properties : []);

  const compositionIds = (data.compositions ?? [])
    .map((c) => c.document?.id ?? c.documentType?.id ?? c.id)
    .filter((cid): cid is string => typeof cid === "string");
  if (compositionIds.length > 0) {
    const compositionResults = await Promise.all(
      compositionIds.map((cid) => chainCms("get-document-type-by-id", { id: cid })),
    );
    // A failed composition fetch must not be mistaken for "this composition has no
    // properties" — that would surface downstream as a misleading "isn't a property on
    // this document type" error, blaming the caller's alias for what is actually a
    // failed upstream lookup.
    const failed = compositionResults.find((r) => !r.ok);
    if (failed && !failed.ok) return { ok: false, errorResult: failed.errorResult };
    for (const r of compositionResults) {
      const comp = r.ok ? (r.data as RawDocType) : undefined;
      if (comp && Array.isArray(comp.properties)) addProperties(comp.properties);
    }
  }

  return { ok: true, docType: data, properties: Array.from(collected.values()) };
}
