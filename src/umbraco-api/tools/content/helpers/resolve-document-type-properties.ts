/**
 * Document Type Property Resolution
 *
 * A document type's own `properties` array (from `get-document-type-by-id`)
 * only lists properties defined directly on it — properties inherited through
 * compositions live on the *composed* document types instead, named in the
 * `compositions` array. A caller that reads `properties` alone silently
 * misses every composition-inherited property.
 *
 * This walks a document type's compositions — recursively, since a
 * composition (or an inherited parent type, itself listed as a composition
 * with `compositionType: "Inheritance"`) can have compositions of its own —
 * and merges their properties with its own (own properties win on alias
 * collision, then the earliest/closest level over deeper ones). Returns the
 * full set an editor can actually set on a page of this type, plus any
 * composition ids whose fetch failed (so a caller can decide whether a
 * best-effort partial result is fine or a hard error is needed). Extracted
 * so `get-document-type.ts` (read) and `resolve-editor-aliases.ts`
 * (create-page / create-and-publish-page's editorAlias resolution) share one
 * walk and stay in lockstep — see Umbraco-CMS-MCP-Editor#201.
 */

import type { GetDocumentTypeByIdOutput } from "@umbraco-cms/mcp-dev/tool-types";
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

export type DocumentTypeProperty = GetDocumentTypeByIdOutput["properties"][number];

export type ResolveDocumentTypePropertiesResult =
  | {
      ok: true;
      documentType: GetDocumentTypeByIdOutput;
      properties: DocumentTypeProperty[];
      /**
       * Composition (or further-nested composition) document type ids whose
       * `get-document-type-by-id` fetch failed. Non-empty means `properties`
       * is incomplete — a caller that needs certainty (e.g. validating an
       * alias actually doesn't exist) must treat this as "unverifiable",
       * not "doesn't exist". A caller that only wants a best-effort read
       * (e.g. `get-document-type`) can ignore it, matching the old
       * behaviour of silently skipping a composition that failed to load.
       */
      failedCompositionIds: string[];
      /**
       * Parallel to `failedCompositionIds` — the `detail` (or raw text) of
       * each failure's ProblemDetails, so a caller that surfaces the ids to
       * an editor/LLM (e.g. `resolve-editor-aliases.ts`) can explain *why*
       * a composition was unreachable (deleted, permissions, transient CMS
       * error) instead of just naming its id.
       */
      failedCompositionDetails: string[];
    }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Fetch a document type by id and merge in properties inherited through its
 * compositions — walked recursively, since a composition (or an inherited
 * parent type, itself listed as a composition with `compositionType:
 * "Inheritance"`) can have compositions of its own. Own properties win on
 * alias collision, then the earliest (closest) level wins over deeper ones.
 * A `visited` set guards against cycles and refetching a shared composition.
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

  function compositionIdsOf(d: GetDocumentTypeByIdOutput): string[] {
    return Array.from(
      new Set(
        (d.compositions ?? [])
          .map((c) => c.documentType?.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    );
  }

  function describeFailure(errorResult: ReturnType<typeof createToolResultError>): string {
    const text = errorResult.content?.[0]?.type === "text" ? errorResult.content[0].text : undefined;
    if (!text) return "unknown error";
    try {
      const parsed: unknown = JSON.parse(text);
      const detail = (parsed as { detail?: unknown })?.detail;
      return typeof detail === "string" ? detail : text;
    } catch {
      return text;
    }
  }

  addProperties(Array.isArray(data.properties) ? data.properties : []);

  const visited = new Set<string>([documentTypeId]);
  const failedCompositionIds: string[] = [];
  const failedCompositionDetails: string[] = [];

  let frontier = compositionIdsOf(data).filter((id) => !visited.has(id));
  frontier.forEach((id) => visited.add(id));

  while (frontier.length > 0) {
    const results = await Promise.all(frontier.map((id) => chainCms("get-document-type-by-id", { id })));
    const nextFrontier: string[] = [];
    results.forEach((r, i) => {
      if (!r.ok) {
        failedCompositionIds.push(frontier[i]);
        failedCompositionDetails.push(describeFailure(r.errorResult));
        return;
      }
      if (Array.isArray(r.data.properties)) addProperties(r.data.properties);
      for (const id of compositionIdsOf(r.data)) {
        if (!visited.has(id)) {
          visited.add(id);
          nextFrontier.push(id);
        }
      }
    });
    frontier = nextFrontier;
  }

  return {
    ok: true,
    documentType: data,
    properties: Array.from(collected.values()),
    failedCompositionIds,
    failedCompositionDetails,
  };
}
