/**
 * Content Test Helper — static utility class for finding and cleaning up
 * content documents via chained CMS tools.
 *
 * All methods are static. Used in afterEach for name-based cleanup and
 * in builders for locating created items.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

/** Minimal shape returned by tree endpoints */
export interface DocumentTreeItem {
  id: string;
  name?: string;
  hasChildren?: boolean;
  variants?: Array<{ name: string; culture?: string | null; state?: string }>;
}

export class ContentTestHelper {
  private static cursor(skip = 0, take = 100): string {
    return btoa(JSON.stringify({ s: skip, t: take }));
  }

  private static getItemName(item: DocumentTreeItem): string {
    if (item.variants?.length) return item.variants[0].name;
    return item.name ?? "";
  }

  private static findByName(items: DocumentTreeItem[], name: string): DocumentTreeItem | undefined {
    return items.find(item => this.getItemName(item) === name);
  }

  /** Extract the display name from a tree item */
  static getNameFromItem(item?: DocumentTreeItem): string {
    if (!item) return "";
    return this.getItemName(item);
  }

  /** Find a document by name, searching root then one level of children */
  static async findDocument(name: string): Promise<DocumentTreeItem | undefined> {
    try {
      const rootResult = await mcpClientManager.callTool("cms", "get-document-root", {
        cursor: this.cursor(),
      });
      if (rootResult.isError) return undefined;

      const rootData = extractChainedResult(rootResult);
      const items: DocumentTreeItem[] = rootData?.items ?? [];

      const rootMatch = this.findByName(items, name);
      if (rootMatch) return rootMatch;

      // Check children of each root item
      for (const item of items) {
        if (item.hasChildren) {
          try {
            const childResult = await mcpClientManager.callTool("cms", "get-document-children", {
              parentId: item.id,
              cursor: this.cursor(),
            });
            if (!childResult.isError) {
              const childData = extractChainedResult(childResult);
              const children: DocumentTreeItem[] = childData?.items ?? [];
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

  /** Find a document in the recycle bin by name */
  static async findDocumentInRecycleBin(name: string): Promise<DocumentTreeItem | undefined> {
    try {
      const result = await mcpClientManager.callTool("cms", "get-recycle-bin-document-root", {
        cursor: this.cursor(),
      });
      if (result.isError) return undefined;

      const data = extractChainedResult(result);
      const items: DocumentTreeItem[] = data?.items ?? [];

      const match = this.findByName(items, name);
      if (match) return match;

      for (const item of items) {
        if (item.hasChildren) {
          try {
            const childResult = await mcpClientManager.callTool("cms", "get-recycle-bin-document-children", {
              parentId: item.id,
              cursor: this.cursor(),
            });
            if (!childResult.isError) {
              const childData = extractChainedResult(childResult);
              const children: DocumentTreeItem[] = childData?.items ?? [];
              const childMatch = this.findByName(children, name);
              if (childMatch) return childMatch;
            }
          } catch {
            // Continue
          }
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Get children of a document */
  static async getChildren(parentId: string, take = 10): Promise<DocumentTreeItem[]> {
    const result = await mcpClientManager.callTool("cms", "get-document-children", {
      parentId,
      cursor: this.cursor(0, take),
    });
    if (result.isError) return [];
    const data = extractChainedResult(result);
    return data?.items ?? [];
  }

  /** Clean up a document by name — finds it (in tree or recycle bin) and permanently deletes */
  static async cleanup(name: string): Promise<void> {
    try {
      // Try to find in normal tree first
      const item = await this.findDocument(name);
      if (item) {
        try {
          // Move to recycle bin
          await mcpClientManager.callTool("cms", "move-document-to-recycle-bin", { id: item.id });
        } catch {
          // May already be in recycle bin
        }
      }

      // Now find in recycle bin and permanently delete
      const recycled = await this.findDocumentInRecycleBin(name);
      if (recycled) {
        try {
          await mcpClientManager.callTool("cms", "delete-document-recycle-bin-item", { id: recycled.id });
        } catch (error) {
          console.log(`Error permanently deleting document '${name}':`, error);
        }
      }
    } catch (error) {
      console.log(`Error cleaning up document '${name}':`, error);
    }
  }
}
