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

  /** Match by exact name OR Umbraco's duplicate suffix pattern "name (N)" */
  private static findByNameOrDuplicate(items: DocumentTreeItem[], name: string): DocumentTreeItem | undefined {
    const duplicatePattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\(\\d+\\))?$`);
    return items.find(item => duplicatePattern.test(this.getItemName(item)));
  }

  /** Extract the display name from a tree item */
  static getNameFromItem(item?: DocumentTreeItem): string {
    if (!item) return "";
    return this.getItemName(item);
  }

  /** Find a document by name, optionally scoped to a parent. Searches with high take to handle large child lists. */
  static async findDocument(name: string, parentId?: string): Promise<DocumentTreeItem | undefined> {
    try {
      // If parentId given, search directly under that parent
      if (parentId) {
        return await this.findDocumentUnderParent(parentId, name);
      }

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
          const childMatch = await this.findDocumentUnderParent(item.id, name);
          if (childMatch) return childMatch;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Find a document by name directly under a specific parent (paginated, up to 500 items) */
  static async findDocumentUnderParent(parentId: string, name: string): Promise<DocumentTreeItem | undefined> {
    try {
      // Search in pages of 100, up to 500 total
      for (let skip = 0; skip < 500; skip += 100) {
        const childResult = await mcpClientManager.callTool("cms", "get-document-children", {
          parentId,
          cursor: this.cursor(skip, 100),
        });
        if (childResult.isError) return undefined;

        const childData = extractChainedResult(childResult);
        const children: DocumentTreeItem[] = childData?.items ?? [];

        const match = this.findByName(children, name);
        if (match) return match;

        // If fewer items than requested, we've reached the end
        if (children.length < 100) break;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Find a document in the recycle bin by name (paginated, up to 500 items) */
  static async findDocumentInRecycleBin(name: string): Promise<DocumentTreeItem | undefined> {
    try {
      // Search recycle bin root in pages of 100, up to 500
      for (let skip = 0; skip < 500; skip += 100) {
        const result = await mcpClientManager.callTool("cms", "get-recycle-bin-document-root", {
          cursor: this.cursor(skip, 100),
        });
        if (result.isError) return undefined;

        const data = extractChainedResult(result);
        const items: DocumentTreeItem[] = data?.items ?? [];

        const match = this.findByNameOrDuplicate(items, name);
        if (match) return match;

        // Check children of each item in this page
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
                const childMatch = this.findByNameOrDuplicate(children, name);
                if (childMatch) return childMatch;
              }
            } catch {
              // Continue
            }
          }
        }

        if (items.length < 100) break;
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

  /** Clean up a document by ID — move to recycle bin then permanently delete */
  static async cleanupById(id: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "move-document-to-recycle-bin", { id });
    } catch {
      // May already be in recycle bin
    }
    try {
      await mcpClientManager.callTool("cms", "delete-document-recycle-bin-item", { id });
    } catch {
      // Best-effort
    }
  }

  /** Clean up a document by name — finds it (in tree or recycle bin) and permanently deletes */
  static async cleanup(name: string, parentId?: string): Promise<void> {
    try {
      // Try to find in normal tree first
      const item = await this.findDocument(name, parentId);
      if (item) {
        await this.cleanupById(item.id);
        return;
      }

      // Fall back to recycle bin search
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
