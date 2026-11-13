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
 * - culture passed by the caller -> that culture, matched case-insensitively
 *   against the site's languages (Umbraco itself only accepts the exact
 *   casing) and rejected with the list of available cultures when it isn't
 *   one of them
 * - otherwise -> the site's default language
 *
 * Further languages are added afterwards with create-variant / copy-variant.
 *
 * With `forPublish`, a page that would be missing a mandatory language is
 * rejected up front: Umbraco refuses to publish it, and answers the
 * create-and-publish call with an opaque 500 ("Unknown error").
 *
 * Also handed back, so the caller can pass them on to resolveEditorAliases:
 * the fetched document type (saves fetching it a second time) and the site's
 * cultures (to validate per-value cultures). `siteCultures` is undefined when
 * the document type is invariant or the language list didn't fit one page.
 */

import { createToolResultError, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import type { GetDocumentTypeByIdOutput } from "@umbraco-cms/mcp-dev/tool-types";
import { chainCms } from "../../../cms-chain.js";

const LANGUAGE_PAGE_SIZE = 100;

export type ResolvePageCultureResult =
  | { ok: true; culture: string | null; documentType: GetDocumentTypeByIdOutput; siteCultures?: string[] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

export async function resolvePageCulture(
  documentTypeId: string,
  culture: string | undefined,
  { forPublish = false }: { forPublish?: boolean } = {},
): Promise<ResolvePageCultureResult> {
  const docTypeResult = await chainCms("get-document-type-by-id", { id: documentTypeId });
  if (!docTypeResult.ok) return { ok: false, errorResult: docTypeResult.errorResult };

  const documentType = docTypeResult.data;

  if (!documentType.variesByCulture) {
    return { ok: true, culture: null, documentType };
  }

  const langResult = await chainCms("get-language", { cursor: encodeCursor({ s: 0, t: LANGUAGE_PAGE_SIZE }) });
  if (!langResult.ok) return { ok: false, errorResult: langResult.errorResult };

  const languages = langResult.data.items ?? [];
  // More languages than one page: the list can't prove a culture is unknown or
  // that no mandatory language is missing, so those checks are left to Umbraco.
  const complete = (langResult.data.total ?? languages.length) <= languages.length;
  const siteCultures = languages.map((l) => l.isoCode);

  let pageCulture: string;
  if (culture) {
    const match = siteCultures.find((c) => c.toLowerCase() === culture.toLowerCase());
    if (!match && complete) {
      return {
        ok: false,
        errorResult: createToolResultError(
          `Culture "${culture}" is not a language on this site. Available cultures: ${siteCultures.join(", ")}.`,
        ),
      };
    }
    pageCulture = match ?? culture;
  } else {
    const defaultLanguage = languages.find((l) => l.isDefault);
    if (!defaultLanguage?.isoCode) {
      return {
        ok: false,
        errorResult: createToolResultError(
          "This document type varies by culture, but no default language could be determined. Call list-languages and pass `culture` explicitly.",
        ),
      };
    }
    pageCulture = defaultLanguage.isoCode;
  }

  if (forPublish) {
    const missingMandatory = languages
      .filter((l) => l.isMandatory && l.isoCode !== pageCulture)
      .map((l) => l.isoCode);
    if (missingMandatory.length > 0) {
      const one = missingMandatory.length === 1;
      return {
        ok: false,
        errorResult: createToolResultError(
          `Cannot create and publish this page in ${pageCulture} alone: ${missingMandatory.join(", ")} ${one ? "is a mandatory language" : "are mandatory languages"} on this site, and a page can only be published once it exists in every mandatory language. Nothing was created. ${one ? `Either pass culture "${missingMandatory[0]}", or use` : "Use"} create-page, add the other language(s) with create-variant, then publish.`,
        ),
      };
    }
  }

  return { ok: true, culture: pageCulture, documentType, siteCultures: complete ? siteCultures : undefined };
}
