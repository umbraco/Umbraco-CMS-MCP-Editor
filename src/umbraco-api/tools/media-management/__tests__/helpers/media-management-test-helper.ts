/**
 * Media Management Test Helper — static utility class for managing
 * media folders via chained CMS tools.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export interface MediaTreeItem {
  id: string;
  name?: string;
  hasChildren?: boolean;
  mediaType?: string;
}

export class MediaManagementTestHelper {
  private static cursor(skip = 0, take = 100): string {
    return btoa(JSON.stringify({ s: skip, t: take }));
  }

  /** Find a media item by name at root level */
  static async findMediaByName(name: string): Promise<MediaTreeItem | undefined> {
    try {
      const result = await mcpClientManager.callTool("cms", "get-media-root", {
        cursor: this.cursor(),
      });
      if (result.isError) return undefined;
      const data = extractChainedResult(result);
      return (data?.items ?? []).find((item: any) => item.name === name);
    } catch {
      return undefined;
    }
  }

  /** Delete a media item permanently (move to recycle bin then delete) */
  static async cleanup(id: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "move-media-to-recycle-bin", { id });
    } catch {
      // May already be in recycle bin
    }
    try {
      await mcpClientManager.callTool("cms", "delete-media-from-recycle-bin", { id });
    } catch {
      // Best-effort
    }
  }

  /** Delete a media item by name */
  static async cleanupByName(name: string): Promise<void> {
    const item = await this.findMediaByName(name);
    if (item) {
      await this.cleanup(item.id);
    }
  }
}
