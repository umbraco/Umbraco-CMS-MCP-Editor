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

import { UmbracoManagementClient } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";
import { z } from "zod";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PROVIDER_ALIAS = "umbDocumentUrlProvider";

// Module-level cache for .env-based base URL resolution.
let cachedBaseUrl: string | null = null;
let cachedMtimeMs: number | null = null;

/**
 * Parse UMBRACO_BASE_URL out of a .env file's raw text content.
 * Supports optional `export` prefix and strips surrounding quotes, matching
 * standard dotenv behaviour. Returns null when the key is absent.
 */
function readBaseUrlFromEnvFile(envPath: string): string | null {
  try {
    const content = readFileSync(envPath, "utf8");
    // Match a non-commented UMBRACO_BASE_URL line. Allow optional 'export'
    // prefix and strip surrounding quotes (matches dotenv behaviour).
    const match = content.match(/^\s*(?:export\s+)?UMBRACO_BASE_URL\s*=\s*(.+?)\s*$/m);
    if (!match) return null;
    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value || null;
  } catch {
    return null;
  }
}

/**
 * @internal Test-only helper. Resets the module-level mtime/URL cache so
 * isolated unit tests see a clean state. Do NOT call from production code.
 */
export function _resetCacheForTests(): void {
  cachedBaseUrl = null;
  cachedMtimeMs = null;
}

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
 * In stdio mode the value is read from UMBRACO_BASE_URL in the `.env` file at
 * `process.cwd()`, with a per-call `fs.statSync` check so a port change
 * mid-session (e.g. after Umbraco restarts on a different random port in a
 * worktree) is picked up automatically. The URL is cached between calls; the
 * stat is the only cost when nothing has changed.
 *
 * In the hosted Worker runtime (`process.cwd` is absent) or when `.env`
 * doesn't exist, falls back to `process.env.UMBRACO_BASE_URL`. Callers get
 * `null` and should surface a null preview URL rather than throwing.
 */
export function getUmbracoBaseUrl(): string | null {
  // Hosted / Worker runtime — no fs/cwd access; fall back to env var.
  if (
    typeof process === "undefined" ||
    !process.env ||
    typeof process.cwd !== "function"
  ) {
    const raw =
      (typeof process !== "undefined" ? process.env?.UMBRACO_BASE_URL : undefined) ?? null;
    return raw ? raw.replace(/\/+$/, "") : null;
  }

  const envPath = resolve(process.cwd(), ".env");
  let mtimeMs: number | null = null;
  try {
    mtimeMs = statSync(envPath).mtimeMs;
  } catch {
    // .env doesn't exist; fall back to process.env (no caching — env is stable).
    const raw = process.env.UMBRACO_BASE_URL ?? null;
    return raw ? raw.replace(/\/+$/, "") : null;
  }

  if (cachedMtimeMs !== mtimeMs) {
    const fresh = readBaseUrlFromEnvFile(envPath);
    cachedBaseUrl = fresh ?? process.env.UMBRACO_BASE_URL ?? null;
    cachedMtimeMs = mtimeMs;
  }

  return cachedBaseUrl ? cachedBaseUrl.replace(/\/+$/, "") : null;
}

/**
 * Build the cookie-gated backoffice preview URL for a document.
 * Returns null when the base URL isn't resolvable (e.g. hosted runtime without
 * `process.env`).
 *
 * This is the synchronous fallback shape used by read-only tools. Write tools
 * that mirror the backoffice "Save and Preview" action should call
 * `fetchPreviewUrl` instead, which goes through the management API and
 * triggers the same preview-state initialisation.
 */
export function buildPreviewUrl(
  id: string
): { url: string; requiresBackofficeAuth: true } | null {
  const baseUrl = getUmbracoBaseUrl();
  if (!baseUrl) return null;
  return {
    url: `${baseUrl}/umbraco/preview?id=${encodeURIComponent(id)}`,
    requiresBackofficeAuth: true,
  };
}

/**
 * Resolve the preview URL through Umbraco's management API — the same call
 * the backoffice's "Save and Preview" button makes after saving a draft.
 *
 * Hits `GET /umbraco/management/api/v1/document/{id}/preview-url`, which:
 *   1. Initiates preview state for the calling user's session
 *   2. Asks the configured URL provider for the URL to open
 *
 * Note: preview state is set on the API user's session (the one this server
 * authenticates as), not on the editor's browser session. The editor still
 * needs an active backoffice session in the same browser to view the URL.
 *
 * Falls back to `buildPreviewUrl(id)` on any failure so callers always get
 * the same shape — never throws.
 */
export async function fetchPreviewUrl(
  id: string,
  options?: { providerAlias?: string; culture?: string; segment?: string }
): Promise<{ url: string; requiresBackofficeAuth: true } | null> {
  const baseUrl = getUmbracoBaseUrl();
  if (!baseUrl) return null;

  const providerAlias = options?.providerAlias ?? DEFAULT_PROVIDER_ALIAS;
  const params = new URLSearchParams({ providerAlias });
  if (options?.culture) params.set("culture", options.culture);
  if (options?.segment) params.set("segment", options.segment);

  try {
    const response = await UmbracoManagementClient<{ url?: string | null }>({
      url: `/umbraco/management/api/v1/document/${encodeURIComponent(id)}/preview-url?${params.toString()}`,
      method: "GET",
    });
    const rawUrl = response?.url;
    if (rawUrl) {
      const absoluteUrl = /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : new URL(rawUrl.replace(/^\/+/, ""), `${baseUrl}/umbraco/`).toString();
      return { url: absoluteUrl, requiresBackofficeAuth: true };
    }
  } catch {
    // Fall through to the synchronous fallback below.
  }

  return buildPreviewUrl(id);
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
