/**
 * Recycle Bin Helpers
 *
 * Shared utilities for the three recycle-bin tools. Resolves the chained
 * CMS tool names for content vs media and provides a bounded subtree probe
 * used to build destructive-action previews.
 */

import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";

export type RecycleBinType = "content" | "media";

const mediaTools = {
  listRoot: "get-recycle-bin-media-root",
  listChildren: "get-recycle-bin-media-children",
  permanentDelete: "delete-media-from-recycle-bin",
  empty: "empty-media-recycle-bin",
  originalParent: "get-recycle-bin-media-original-parent",
} as const;

const contentTools = {
  listRoot: "get-recycle-bin-document-root",
  listChildren: "get-recycle-bin-document-children",
  permanentDelete: "delete-from-recycle-bin",
  empty: "empty-recycle-bin",
  originalParent: "get-recycle-bin-document-original-parent",
} as const;

export type RecycleBinChainedTools = typeof mediaTools | typeof contentTools;

export function chainedTools(type: RecycleBinType): RecycleBinChainedTools {
  return type === "media" ? mediaTools : contentTools;
}

export function itemName(item: { variants?: { name?: string }[] | null; name?: string | null } | null | undefined): string {
  return item?.variants?.[0]?.name ?? item?.name ?? "Unknown";
}

/** Upper bound on descendants walked for a destructive-action preview. */
export const SUBTREE_PROBE_LIMIT = 50;

export interface SubtreeProbe {
  /** Direct + indirect descendants discovered, capped at SUBTREE_PROBE_LIMIT. */
  descendantCount: number;
  /** True when the walk was truncated before exhausting the subtree. */
  truncated: boolean;
  /** Names of up to the first 5 descendants encountered, in walk order. */
  sampleNames: string[];
}

/**
 * Walk a trashed folder's subtree, counting descendants up to a cap.
 * Stops traversing once the cap is reached — this is a preview, not a full scan.
 */
export async function probeSubtree(
  type: RecycleBinType,
  rootId: string,
  limit: number = SUBTREE_PROBE_LIMIT,
): Promise<SubtreeProbe> {
  const tools = chainedTools(type);
  const queue: string[] = [rootId];
  const visited = new Set<string>();
  let count = 0;
  const sampleNames: string[] = [];
  let truncated = false;

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    if (visited.has(parentId)) continue;
    visited.add(parentId);

    const result = await chainCms(tools.listChildren, {
      parentId,
      cursor: encodeCursor({ s: 0, t: 100 }),
    });
    if (!result.ok) break;
    // extractChainedResult may return undefined if the body wasn't parseable.
    const data = result.data as { items?: unknown[]; total?: number } | undefined;
    const items = (data?.items ?? []) as Array<{ id: string; hasChildren?: boolean; variants?: { name?: string }[]; name?: string }>;

    for (const item of items) {
      count += 1;
      if (sampleNames.length < 5) sampleNames.push(itemName(item));
      if (count >= limit) {
        truncated = (data?.total ?? items.length) > items.length || queue.length > 0 || (item.hasChildren ?? false);
        return { descendantCount: count, truncated: true, sampleNames };
      }
      if (item.hasChildren) queue.push(item.id);
    }

    // If a single page didn't cover everything, note truncation.
    if ((data?.total ?? items.length) > items.length) {
      truncated = true;
    }
  }

  return { descendantCount: count, truncated, sampleNames };
}

/**
 * Count items at the recycle bin root (no recursion).
 * Uses total from the API response — cheap single call.
 */
export async function countRootItems(type: RecycleBinType): Promise<number> {
  const tools = chainedTools(type);
  const result = await chainCms(tools.listRoot, {
    cursor: encodeCursor({ s: 0, t: 1 }),
  });
  if (!result.ok) return 0;
  return (result.data as { total?: number } | undefined)?.total ?? 0;
}

/** Format a short preview string from a list of names: top 5 + "…and N more". */
export function formatNamePreview(names: string[], total: number): string {
  if (names.length === 0) return "";
  const head = names.slice(0, 5).map(n => `"${n}"`).join(", ");
  const remaining = total - Math.min(names.length, 5);
  return remaining > 0 ? `${head}, …and ${remaining} more` : head;
}
