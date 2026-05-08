/**
 * Dictionary Test Helper — static utility class for finding and cleaning up
 * dictionary items via chained CMS tools.
 *
 * All methods are static. Used in afterEach for name-based cleanup and
 * in builders for locating created items.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

/** Minimal shape returned by dictionary tree endpoints */
export interface DictionaryTreeItem {
  id: string;
  name?: string;
  hasChildren?: boolean;
  translatedLanguages?: string[];
}

export class DictionaryTestHelper {
  private static cursor(skip = 0, take = 100): string {
    return btoa(JSON.stringify({ s: skip, t: take }));
  }

  /** Find a dictionary item by name, searching root then one level of children */
  static async findDictionaryItem(name: string): Promise<DictionaryTreeItem | undefined> {
    try {
      const rootResult = await mcpClientManager.callTool("cms", "get-dictionary-root", {
        cursor: this.cursor(),
      });
      if (rootResult.isError) return undefined;

      const rootData = extractChainedResult(rootResult);
      const items: DictionaryTreeItem[] = rootData?.items ?? [];

      const match = items.find(item => item.name === name);
      if (match) return match;

      // Check children of each root item
      for (const item of items) {
        if (item.hasChildren) {
          try {
            const childResult = await mcpClientManager.callTool("cms", "get-dictionary-children", {
              parentId: item.id,
              cursor: this.cursor(),
            });
            if (!childResult.isError) {
              const childData = extractChainedResult(childResult);
              const children: DictionaryTreeItem[] = childData?.items ?? [];
              const childMatch = children.find(c => c.name === name);
              if (childMatch) return childMatch;
            }
          } catch {
            // Continue searching
          }
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Search for a dictionary item by name */
  static async searchDictionaryItem(name: string): Promise<DictionaryTreeItem | undefined> {
    try {
      const result = await mcpClientManager.callTool("cms", "find-dictionary", { query: name });
      if (result.isError) return undefined;
      const data = extractChainedResult(result);
      const items: DictionaryTreeItem[] = data?.items ?? [];
      return items.find(item => item.name === name);
    } catch {
      return undefined;
    }
  }

  /** List root-level dictionary items */
  static async listRootItems(take = 100): Promise<DictionaryTreeItem[]> {
    const result = await mcpClientManager.callTool("cms", "get-dictionary-root", {
      cursor: this.cursor(0, take),
    });
    if (result.isError) return [];
    const data = extractChainedResult(result);
    return data?.items ?? [];
  }

  /** Clean up a dictionary item by name — finds it and permanently deletes */
  static async cleanup(name: string): Promise<void> {
    try {
      // Try tree search first, then text search
      let item = await this.findDictionaryItem(name);
      if (!item) {
        item = await this.searchDictionaryItem(name);
      }
      if (item) {
        try {
          await mcpClientManager.callTool("cms", "delete-dictionary-item", { id: item.id });
        } catch (error) {
          console.log(`Error deleting dictionary item '${name}':`, error);
        }
      }
    } catch (error) {
      console.log(`Error cleaning up dictionary item '${name}':`, error);
    }
  }
}
