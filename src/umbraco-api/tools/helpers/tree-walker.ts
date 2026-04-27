/**
 * Content Tree Walker
 *
 * Shared helper for tools that need to scan pages in the content tree.
 * Fetches tree items then enriches each with full document data.
 * Used by reporting and auditing tools.
 */

import { chainCms } from "../../cms-chain.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";

export interface TreeWalkOptions {
  /** Scope to a subtree (omit for root) */
  parentId?: string;
  /** Max items to fetch from the tree */
  scanLimit?: number;
}

export interface WalkedPage {
  id: string;
  name: string;
  url: string;
  documentType: string;
  documentTypeAlias: string;
  values: any[];
  variants: any[];
  state: string;
  depth?: number;
}

/**
 * Walk the content tree and return enriched page data.
 *
 * Fetches tree items (root or children), then calls get-document-by-id
 * for each to get full property values. Uses Promise.all for parallelism.
 *
 * @deprecated Do not use in new tools. N+1 enrichment + 100-item scan cap make
 * this ineffective on real sites; the tools that depend on it were disabled in
 * commit 24663b3 pending a filtered-pages endpoint. Build report/audit tools
 * against per-item or filtered-list dev MCP endpoints instead.
 */
export async function walkContentTree(
  options: TreeWalkOptions = {},
): Promise<WalkedPage[]> {
  const { parentId, scanLimit = 100 } = options;

  const treeItems: any[] = [];
  let cursor: string | undefined = encodeCursor({ s: 0, t: Math.min(scanLimit, 100) });

  while (treeItems.length < scanLimit) {
    const treeResult = parentId
      ? await chainCms("get-document-children", { parentId, cursor: cursor as string | undefined })
      : await chainCms("get-document-root", { cursor: cursor as string | undefined });
    if (!treeResult.ok) break;
    const treeData: any = treeResult.data;
    treeItems.push(...(treeData?.items ?? []));
    if (!treeData?.nextCursor) break;
    cursor = treeData.nextCursor;
  }

  const enriched = await Promise.all(
    treeItems.map(async (item: any): Promise<WalkedPage | null> => {
      try {
        const docResult = await chainCms("get-document-by-id", { id: item.id });
        if (!docResult.ok) return null;
        const doc = docResult.data;
        const variant = doc.variants?.[0];
        // GetDocumentByIdOutput doesn't include `urls` or documentType.name/alias —
        // they're present at runtime but not in the upstream Zod schema.
        const extra = doc as { urls?: { url?: string }[] };
        const dt = doc.documentType as { name?: string; alias?: string };

        return {
          id: doc.id,
          name: variant?.name ?? "Unknown",
          url: extra.urls?.[0]?.url ?? "",
          documentType: dt?.name ?? "",
          documentTypeAlias: dt?.alias ?? "",
          values: doc.values ?? [],
          variants: doc.variants ?? [],
          state: variant?.state ?? "unknown",
        };
      } catch {
        return null;
      }
    }),
  );

  return enriched.filter((p): p is WalkedPage => p !== null);
}

/**
 * Walk the media tree and return items.
 *
 * @deprecated Do not use in new tools. Same limits and rationale as
 * {@link walkContentTree} — disabled pending a filtered-pages endpoint
 * (commit 24663b3).
 */
export async function walkMediaTree(
  options: TreeWalkOptions = {},
): Promise<any[]> {
  const { parentId, scanLimit = 100 } = options;

  const allItems: any[] = [];
  let cursor: string | undefined = encodeCursor({ s: 0, t: Math.min(scanLimit, 100) });

  while (allItems.length < scanLimit) {
    const result = parentId
      ? await chainCms("get-media-children", { parentId, cursor: cursor as string | undefined })
      : await chainCms("get-media-root", { cursor: cursor as string | undefined });
    if (!result.ok) break;
    const data: any = result.data;
    allItems.push(...(data?.items ?? []));
    if (!data?.nextCursor) break;
    cursor = data.nextCursor;
  }

  return allItems;
}

/**
 * Build cursor argument for a chained CMS call from handler skip/take values.
 */
export function buildChainedCursor(skip: number, take: number): string {
  return encodeCursor({ s: skip, t: take });
}

/**
 * Strip HTML tags and return plain text.
 */
export function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Count words in a string.
 */
export function countWords(text: string): number {
  const stripped = stripHtml(text);
  if (!stripped) return 0;
  return stripped.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract text content from a page's values, stripping HTML.
 * Concatenates all string values that look like content.
 */
export function extractTextContent(values: any[]): string {
  return (values || [])
    .filter((v: any) => typeof v.value === "string" && v.value.length > 10)
    .map((v: any) => stripHtml(v.value))
    .join(" ");
}

/**
 * Extract headings from HTML content.
 */
export function extractHeadings(html: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const regex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    headings.push({ level: parseInt(match[1]), text: stripHtml(match[2]) });
  }
  return headings;
}

/**
 * Extract images from HTML content.
 */
export function extractImages(html: string): { src: string; alt: string; hasAlt: boolean }[] {
  const images: { src: string; alt: string; hasAlt: boolean }[] = [];
  const regex = /<img[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const srcMatch = match[0].match(/src="([^"]*)"/i);
    const altMatch = match[0].match(/alt="([^"]*)"/i);
    const src = srcMatch?.[1] ?? "";
    const alt = altMatch?.[1] ?? "";
    images.push({ src, alt, hasAlt: !!altMatch && alt.length > 0 });
  }
  return images;
}
