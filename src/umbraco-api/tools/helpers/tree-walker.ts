/**
 * Content Tree Walker
 *
 * Shared helper for tools that need to scan pages in the content tree.
 * Fetches tree items then enriches each with full document data.
 * Used by reporting and auditing tools.
 */

import { mcpClientManager } from "../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

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
 */
export async function walkContentTree(
  options: TreeWalkOptions = {},
): Promise<WalkedPage[]> {
  const { parentId, scanLimit = 100 } = options;

  const treeResult = parentId
    ? await mcpClientManager.callTool("cms", "get-tree-document-children", { parentId, take: scanLimit, skip: 0 })
    : await mcpClientManager.callTool("cms", "get-tree-document-root", { take: scanLimit, skip: 0 });

  if (treeResult.isError) return [];
  const treeData = extractChainedResult(treeResult);
  const treeItems: any[] = treeData?.items ?? [];

  const enriched = await Promise.all(
    treeItems.map(async (item: any): Promise<WalkedPage | null> => {
      try {
        const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: item.id });
        if (docResult.isError) return null;
        const doc = extractChainedResult(docResult);
        const variant = doc.variants?.[0] ?? {};

        return {
          id: doc.id,
          name: variant.name ?? doc.name ?? "Unknown",
          url: doc.urls?.[0]?.url ?? "",
          documentType: doc.documentType?.name ?? "",
          documentTypeAlias: doc.documentType?.alias ?? "",
          values: doc.values ?? [],
          variants: doc.variants ?? [],
          state: variant.state ?? doc.state ?? "unknown",
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
 */
export async function walkMediaTree(
  options: TreeWalkOptions = {},
): Promise<any[]> {
  const { parentId, scanLimit = 100 } = options;

  const result = parentId
    ? await mcpClientManager.callTool("cms", "get-media-children", { parentId, take: scanLimit, skip: 0 })
    : await mcpClientManager.callTool("cms", "get-media-root", { take: scanLimit, skip: 0 });

  if (result.isError) return [];
  const data = extractChainedResult(result);
  return data?.items ?? [];
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
