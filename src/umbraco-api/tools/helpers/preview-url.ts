/**
 * Preview URL Helper
 *
 * Shared helpers for surfacing Umbraco preview / published URLs in tool outputs.
 *
 * Preview URLs are cookie-gated — they only render draft content if the viewer
 * has an active backoffice session in the same browser. They are NOT shareable
 * links. The returned object carries `requiresBackofficeAuth: true` so the LLM
 * can communicate that constraint when relaying the URL to the editor.
 */

import { chainCms } from "../../cms-chain.js";
import { z } from "zod";

export const previewUrlSchema = z
  .object({
    url: z.string(),
    requiresBackofficeAuth: z.literal(true),
  })
  .nullable()
  .describe(
    "Backoffice preview link for the draft. `requiresBackofficeAuth: true` — the viewer must have an active Umbraco backoffice session in the same browser. Not a shareable link. Null when the base URL is not resolvable."
  );

export const publishedUrlsSchema = z
  .array(z.string())
  .describe(
    "Live public URLs for the page (one per culture / hostname). Empty array when the page has no resolvable routes (draft-only or not yet published)."
  );

/**
 * Read the Umbraco base URL from the environment.
 *
 * In stdio mode it's set in `process.env.UMBRACO_BASE_URL`. In the hosted
 * Worker runtime `process.env` may not carry this binding — callers get
 * `null` and should surface a null preview URL rather than throwing.
 */
export function getUmbracoBaseUrl(): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  const raw = process.env.UMBRACO_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * Build the cookie-gated backoffice preview URL for a document.
 * Returns null when the base URL isn't resolvable (e.g. hosted runtime without
 * `process.env`).
 */
export function buildPreviewUrl(
  id: string
): { url: string; requiresBackofficeAuth: true } | null {
  const baseUrl = getUmbracoBaseUrl();
  if (!baseUrl) return null;
  return {
    url: `${baseUrl}/umbraco/preview/?id=${encodeURIComponent(id)}`,
    requiresBackofficeAuth: true,
  };
}

/**
 * Extract published URL strings from a `urls` array that follows either the
 * `get-document-by-id` shape (`{ culture, url, ... }[]`) or the
 * `get-document-urls` shape (`{ id, urlInfos: [{ culture, url, ... }] }[]`).
 * Drops entries without a concrete URL string.
 */
export function flattenPublishedUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  for (const entry of urls) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { urlInfos?: { url?: string }[]; url?: string };
    // get-document-urls shape: { id, urlInfos: [...] }
    if (Array.isArray(e.urlInfos)) {
      for (const info of e.urlInfos) {
        if (info && typeof info.url === "string" && info.url.length > 0) {
          out.push(info.url);
        }
      }
      continue;
    }
    // get-document-by-id shape: { url, culture, ... }
    if (typeof e.url === "string" && e.url.length > 0) {
      out.push(e.url);
    }
  }
  return out;
}

/**
 * Chain `get-document-urls` for a single document id and return the flattened
 * URL list. Returns `[]` on any failure — never throws. Callers surface this
 * as `publishedUrls` in tool output.
 */
export async function fetchPublishedUrls(id: string): Promise<string[]> {
  try {
    const result = await chainCms("get-document-urls", { id: [id] });
    if (!result.ok) return [];
    return flattenPublishedUrls(result.data.items);
  } catch {
    return [];
  }
}
