/**
 * Document Type Property Resolution
 *
 * A document type's own `properties` array (from `get-document-type-by-id`)
 * only lists properties defined directly on it — properties inherited through
 * compositions live on the *composed* document types instead, named in the
 * `compositions` array. A caller that reads `properties` alone silently
 * misses every composition-inherited property.
 *
 * This walks a document type's compositions and merges their properties with
 * its own (own properties win on alias collision), returning the full set an
 * editor can actually set on a page of this type. Shared by
 * `resolve-editor-aliases.ts` (create-page / create-and-publish-page /
 * create-element's editorAlias resolution) — see Umbraco-CMS-MCP-Editor#201,
 * #208.
 */

import type { GetDocumentTypeByIdOutput } from "@umbraco-cms/mcp-dev/tool-types";
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

export type DocumentTypeProperty = GetDocumentTypeByIdOutput["properties"][number];

export type ResolveDocumentTypePropertiesResult =
  | { ok: true; documentType: GetDocumentTypeByIdOutput; properties: DocumentTypeProperty[] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Fetch a document type by id and merge in properties inherited through its
 * compositions. Own properties win on alias collision. Also applies to
 * element types, which are document types (isElement).
 */
export async function resolveDocumentTypeProperties(
  documentTypeId: string,
): Promise<ResolveDocumentTypePropertiesResult> {
  const docTypeResult = await chainCms("get-document-type-by-id", { id: documentTypeId });
  if (!docTypeResult.ok) return { ok: false, errorResult: docTypeResult.errorResult };
  const data = docTypeResult.data;

  const collected = new Map<string, DocumentTypeProperty>();
  function addProperties(props: DocumentTypeProperty[]): void {
    for (const p of props) {
      if (p.alias && !collected.has(p.alias)) {
        collected.set(p.alias, p);
      }
    }
  }

  addProperties(Array.isArray(data.properties) ? data.properties : []);

  const compositionIds = (data.compositions ?? [])
    .map((c) => c.documentType?.id)
    .filter((id): id is string => typeof id === "string");

  if (compositionIds.length > 0) {
    const compositionResults = await Promise.all(
      compositionIds.map((cid) => chainCms("get-document-type-by-id", { id: cid })),
    );
    const failed = compositionResults.find((r) => !r.ok);
    if (failed && !failed.ok) return { ok: false, errorResult: failed.errorResult };
    for (const r of compositionResults) {
      if (r.ok && Array.isArray(r.data.properties)) addProperties(r.data.properties);
    }
  }

  return { ok: true, documentType: data, properties: Array.from(collected.values()) };
}
