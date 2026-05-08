/**
 * Media Test Helper — static utility class for finding and cleaning up
 * media items via chained CMS tools.
 *
 * All methods are static. Used in afterEach for name-based cleanup and
 * in builders for locating created items.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { buildChainedCursor } from "../../../helpers/tree-walker.js";

/** Minimal shape of a media item returned by media root/children endpoints */
export interface MediaTreeItem {
  id: string;
  name?: string;
  hasChildren?: boolean;
  variants?: Array<{ name: string; culture?: string | null }>;
  mediaType?: string | { alias?: string; name?: string };
}

export class MediaTestHelper {
  private static cursor(skip = 0, take = 100): string {
    return buildChainedCursor(skip, take);
  }

  private static getItemName(item: MediaTreeItem): string {
    if (item.variants?.length) return item.variants[0].name;
    return item.name ?? "";
  }

  private static findByName(items: MediaTreeItem[], name: string): MediaTreeItem | undefined {
    return items.find(item => this.getItemName(item) === name);
  }

  /** Find a media item at root by name */
  static async findMediaByName(name: string): Promise<MediaTreeItem | undefined> {
    try {
      const rootResult = await mcpClientManager.callTool("cms", "get-media-root", {
        cursor: this.cursor(),
      });
      if (rootResult.isError) return undefined;

      const rootData = extractChainedResult(rootResult);
      const items: MediaTreeItem[] = rootData?.items ?? [];

      const rootMatch = this.findByName(items, name);
      if (rootMatch) return rootMatch;

      // Check one level of children for each root item
      for (const item of items) {
        if (item.hasChildren) {
          try {
            const childResult = await mcpClientManager.callTool("cms", "get-media-children", {
              parentId: item.id,
              cursor: this.cursor(),
            });
            if (!childResult.isError) {
              const childData = extractChainedResult(childResult);
              const children: MediaTreeItem[] = childData?.items ?? [];
              const childMatch = this.findByName(children, name);
              if (childMatch) return childMatch;
            }
          } catch {
            // Continue searching other branches
          }
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Get children of a media folder */
  static async getChildren(parentId: string, take = 10): Promise<MediaTreeItem[]> {
    const result = await mcpClientManager.callTool("cms", "get-media-children", {
      parentId,
      cursor: this.cursor(0, take),
    });
    if (result.isError) return [];
    const data = extractChainedResult(result);
    return data?.items ?? [];
  }

  /** Clean up a media item by name — finds it and deletes it */
  static async cleanup(name: string): Promise<void> {
    try {
      const item = await this.findMediaByName(name);
      if (item) {
        try {
          await mcpClientManager.callTool("cms", "delete-media", { id: item.id });
        } catch (error) {
          console.log(`Error deleting media '${name}':`, error);
        }
      }
    } catch (error) {
      console.log(`Error cleaning up media '${name}':`, error);
    }
  }
}
