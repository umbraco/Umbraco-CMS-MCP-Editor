/**
 * Recycle Bin Test Helper — static utility class for finding trashed items
 * in the content or media recycle bin and permanently deleting them.
 *
 * All methods are static. Used in afterEach for name-based cleanup and in
 * builders for locating just-trashed items.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export type RecycleBinKind = "content" | "media";

export interface RecycleBinItem {
  id: string;
  name?: string;
  hasChildren?: boolean;
}

function itemDisplayName(item: any): string {
  return item?.variants?.[0]?.name ?? item?.name ?? "";
}

function chainedTools(kind: RecycleBinKind) {
  if (kind === "media") {
    return {
      listRoot: "get-recycle-bin-media-root",
      listChildren: "get-recycle-bin-media-children",
      permanentDelete: "delete-media-from-recycle-bin",
    };
  }
  return {
    listRoot: "get-recycle-bin-document-root",
    listChildren: "get-recycle-bin-document-children",
    permanentDelete: "delete-from-recycle-bin",
  };
}

export class RecycleBinTestHelper {
  private static cursor(skip = 0, take = 100): string {
    return btoa(JSON.stringify({ s: skip, t: take }));
  }

  /** Find a trashed item in the recycle bin root by exact name (paginated, up to 500). */
  static async findInBin(kind: RecycleBinKind, name: string): Promise<RecycleBinItem | undefined> {
    const tools = chainedTools(kind);
    try {
      for (let skip = 0; skip < 500; skip += 100) {
        const result = await mcpClientManager.callTool("cms", tools.listRoot, {
          cursor: this.cursor(skip, 100),
        });
        if (result.isError) return undefined;
        const data = extractChainedResult(result);
        const items: any[] = data?.items ?? [];
        const match = items.find(i => itemDisplayName(i) === name);
        if (match) return { id: match.id, name, hasChildren: match.hasChildren };
        if (items.length < 100) break;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Permanently delete a trashed item by id. Best-effort — ignores errors. */
  static async cleanupById(kind: RecycleBinKind, id: string): Promise<void> {
    const tools = chainedTools(kind);
    try {
      await mcpClientManager.callTool("cms", tools.permanentDelete, { id });
    } catch {
      // best-effort
    }
  }

  /** Find a trashed item by name and permanently delete it. Best-effort. */
  static async cleanupByName(kind: RecycleBinKind, name: string): Promise<void> {
    const item = await this.findInBin(kind, name);
    if (item) {
      await this.cleanupById(kind, item.id);
    }
  }

  /** Move a media item to the recycle bin via the chained CMS tool (no elicitation). */
  static async trashMedia(id: string): Promise<void> {
    await mcpClientManager.callTool("cms", "move-media-to-recycle-bin", { id });
  }

  /** Move a document to the recycle bin via the chained CMS tool (no elicitation). */
  static async trashDocument(id: string): Promise<void> {
    await mcpClientManager.callTool("cms", "move-document-to-recycle-bin", { id });
  }
}
