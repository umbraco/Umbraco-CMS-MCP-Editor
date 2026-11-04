/**
 * Culture Resolution for create-page / create-and-publish-page
 *
 * A document type that varies by culture needs every new document to be
 * created with at least one culture variant (`cultures` on
 * `create-document` / `create-and-publish-document`). Without it the CMS tool
 * builds a single variant with `culture: null`, which Umbraco rejects for a
 * culture-variant document type — so creating a page on a multilingual site
 * was impossible through these tools.
 *
 * This resolves the culture to create the page in:
 * - document type does not vary by culture -> `null` (create invariant, any
 *   requested culture is ignored)
 * - culture passed by the caller -> that culture
 * - otherwise -> the site's default language
 *
 * Further languages are added afterwards with create-variant / copy-variant.
 */

import { createToolResultError, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

export type ResolvePageCultureResult =
  | { ok: true; culture: string | null }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

export async function resolvePageCulture(
  documentTypeId: string,
  culture: string | undefined,
): Promise<ResolvePageCultureResult> {
  const docTypeResult = await chainCms("get-document-type-by-id", { id: documentTypeId });
  if (!docTypeResult.ok) return { ok: false, errorResult: docTypeResult.errorResult };

  if (!docTypeResult.data.variesByCulture) {
    return { ok: true, culture: null };
  }

  if (culture) {
    return { ok: true, culture };
  }

  const langResult = await chainCms("get-language", { cursor: encodeCursor({ s: 0, t: 100 }) });
  if (!langResult.ok) return { ok: false, errorResult: langResult.errorResult };

  const defaultLanguage = (langResult.data.items ?? []).find((l) => l.isDefault);
  if (!defaultLanguage?.isoCode) {
    return {
      ok: false,
      errorResult: createToolResultError(
        "This document type varies by culture, but no default language could be determined. Call list-languages and pass `culture` explicitly.",
      ),
    };
  }

  return { ok: true, culture: defaultLanguage.isoCode };
}
