/**
 * Link Extractor
 *
 * Shared helper for extracting outbound references from page property values.
 * Detects content/media picker UUIDs, rich text links, and external URLs.
 */

import { mcpClientManager } from "../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

// UUID v4 pattern for detecting picker references
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export interface ExtractedLinks {
  /** All UUIDs found in property values — may be content or media, callers resolve */
  allIds: string[];
  /** External URLs found in content */
  externalUrls: { url: string; domain: string }[];
}

/**
 * Check if a value is a BlockList or BlockGrid structure.
 */
function isBlockListOrGridValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.contentData)
  );
}

/**
 * Check if a value is Rich Text with embedded blocks.
 */
function isRteWithBlocks(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    value.blocks !== null &&
    typeof value.blocks === "object" &&
    Array.isArray(value.blocks?.contentData)
  );
}

/**
 * Check if a value is a plain Rich Text value (markup string, no blocks).
 */
function isPlainRteValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    !isRteWithBlocks(value)
  );
}

/**
 * Extract <a href="..."> URLs from HTML.
 */
function extractHrefUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /<a[^>]+href="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      urls.push(href);
    }
  }
  return urls;
}

/**
 * Extract <img src="..."> URLs from HTML.
 */
function extractImgSrcs(html: string): string[] {
  const srcs: string[] = [];
  const regex = /<img[^>]+src="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) srcs.push(match[1]);
  }
  return srcs;
}

/**
 * Parse a URL and return its domain, or null if invalid.
 */
function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is external (starts with http:// or https://).
 */
function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Extract all UUIDs from a string value (e.g. a content/media picker stored as a UUID string).
 */
function extractUuids(value: string): string[] {
  const matches = value.match(UUID_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Recursively extract block property values from BlockList/BlockGrid/RTE blocks.
 */
function extractBlockValues(contentData: any[]): any[] {
  const values: any[] = [];
  for (const block of contentData) {
    if (Array.isArray(block.values)) {
      values.push(...block.values);
    }
  }
  return values;
}

/**
 * Extract all outbound links from a page's property values.
 *
 * Processes:
 * - String values that are UUIDs (content/media pickers)
 * - Array values containing objects with UUIDs (multi-pickers)
 * - Rich text markup (plain and with blocks) for <a> and <img> tags
 * - BlockList/BlockGrid contentData (recursively inspects block properties)
 *
 * Returns deduplicated lists of content IDs, media IDs, and external URLs.
 * Note: We cannot reliably distinguish content picker UUIDs from media picker
 * UUIDs at this level — callers should resolve IDs against both endpoints.
 */
export function extractLinksFromValues(values: any[]): ExtractedLinks {
  const allUuids = new Set<string>();
  const externalUrlMap = new Map<string, string>(); // url -> domain

  function processHtml(html: string): void {
    // Extract link hrefs
    for (const href of extractHrefUrls(html)) {
      if (isExternalUrl(href)) {
        const domain = getDomain(href);
        if (domain) externalUrlMap.set(href, domain);
      } else {
        // Internal link — may contain a UUID (e.g. /{localLink:uuid})
        for (const uuid of extractUuids(href)) {
          allUuids.add(uuid.toLowerCase());
        }
      }
    }
    // Extract image srcs
    for (const src of extractImgSrcs(html)) {
      if (isExternalUrl(src)) {
        const domain = getDomain(src);
        if (domain) externalUrlMap.set(src, domain);
      } else {
        for (const uuid of extractUuids(src)) {
          allUuids.add(uuid.toLowerCase());
        }
      }
    }
    // Also scan the raw HTML for UUIDs (catches data-udi and similar attributes)
    for (const uuid of extractUuids(html)) {
      allUuids.add(uuid.toLowerCase());
    }
  }

  function processValue(v: any): void {
    const val = v.value;

    if (val === null || val === undefined) return;

    // String value — could be a UUID or URL
    if (typeof val === "string") {
      if (isExternalUrl(val)) {
        const domain = getDomain(val);
        if (domain) externalUrlMap.set(val, domain);
      } else {
        for (const uuid of extractUuids(val)) {
          allUuids.add(uuid.toLowerCase());
        }
      }
      return;
    }

    // Array value — multi-picker (array of objects with contentId/mediaKey/id)
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") {
          for (const uuid of extractUuids(item)) {
            allUuids.add(uuid.toLowerCase());
          }
        } else if (typeof item === "object" && item !== null) {
          // Multi-node picker: { contentId: uuid } or { mediaKey: uuid } or { unique: uuid }
          const id = item.contentId ?? item.mediaKey ?? item.unique ?? item.id ?? item.key;
          if (typeof id === "string") {
            for (const uuid of extractUuids(id)) {
              allUuids.add(uuid.toLowerCase());
            }
          }
          // Multi-URL picker: { url: "...", ... }
          if (typeof item.url === "string" && isExternalUrl(item.url)) {
            const domain = getDomain(item.url);
            if (domain) externalUrlMap.set(item.url, domain);
          }
        }
      }
      return;
    }

    // Object value — check for RTE, blocks, or picker objects
    if (typeof val === "object") {
      // RTE with blocks
      if (isRteWithBlocks(val)) {
        processHtml(val.markup);
        const blockValues = extractBlockValues(val.blocks.contentData);
        for (const bv of blockValues) processValue(bv);
        return;
      }

      // Plain RTE
      if (isPlainRteValue(val)) {
        processHtml(val.markup);
        return;
      }

      // BlockList/BlockGrid
      if (isBlockListOrGridValue(val)) {
        const blockValues = extractBlockValues(val.contentData);
        for (const bv of blockValues) processValue(bv);
        return;
      }

      // Single picker object: { contentId: uuid } or { mediaKey: uuid }
      const id = val.contentId ?? val.mediaKey ?? val.unique ?? val.id ?? val.key;
      if (typeof id === "string") {
        for (const uuid of extractUuids(id)) {
          allUuids.add(uuid.toLowerCase());
        }
      }

      // URL picker: { url: "..." }
      if (typeof val.url === "string" && isExternalUrl(val.url)) {
        const domain = getDomain(val.url);
        if (domain) externalUrlMap.set(val.url, domain);
      }
    }
  }

  for (const v of values) {
    processValue(v);
  }

  const externalUrls = Array.from(externalUrlMap.entries()).map(([url, domain]) => ({ url, domain }));

  return {
    allIds: Array.from(allUuids),
    externalUrls,
  };
}

export interface ResolvedOutboundLinks {
  internalPages: { id: string; name: string; url: string; documentType: string }[];
  media: { id: string; name: string; mediaType: string }[];
}

/**
 * Resolve extracted UUID references into content pages and media items.
 *
 * Tries each UUID as a document first, then as media. Filters out the
 * source page's own ID to avoid self-references.
 */
export async function resolveOutboundIds(
  candidateIds: string[],
  excludeId?: string,
): Promise<ResolvedOutboundLinks> {
  const internalPages: ResolvedOutboundLinks["internalPages"] = [];
  const media: ResolvedOutboundLinks["media"] = [];

  const filtered = excludeId
    ? candidateIds.filter((cid) => cid !== excludeId.toLowerCase())
    : candidateIds;

  await Promise.all(
    filtered.map(async (refId) => {
      try {
        const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: refId });
        if (!docResult.isError) {
          const refDoc = extractChainedResult(docResult);
          const refVariant = refDoc.variants?.[0] ?? {};
          internalPages.push({
            id: refId,
            name: refVariant.name ?? refDoc.name ?? "Unknown",
            url: refDoc.urls?.[0]?.url ?? "",
            documentType: refDoc.documentType?.alias ?? "",
          });
          return;
        }
      } catch {
        // Not a document — try media
      }

      try {
        const mediaResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: refId });
        if (!mediaResult.isError) {
          const refMedia = extractChainedResult(mediaResult);
          media.push({
            id: refId,
            name: refMedia.variants?.[0]?.name ?? refMedia.name ?? "Unknown",
            mediaType: refMedia.mediaType?.alias ?? refMedia.contentTypeAlias ?? "",
          });
        }
      } catch {
        // Neither document nor media — skip
      }
    })
  );

  return { internalPages, media };
}
