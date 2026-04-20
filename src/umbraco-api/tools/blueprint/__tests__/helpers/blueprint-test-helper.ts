/**
 * Blueprint Test Helper — static utility class for finding and cleaning up
 * blueprints via chained CMS tools.
 *
 * All methods are static. Used in afterEach for name-based cleanup and
 * in builders for locating created items.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

/** Minimal shape returned by blueprint tree endpoints */
export interface BlueprintTreeItem {
  id: string;
  name?: string;
  hasChildren?: boolean;
  variants?: Array<{ name: string; culture?: string | null }>;
}

export class BlueprintTestHelper {
  private static cursor(skip = 0, take = 100): string {
    return btoa(JSON.stringify({ s: skip, t: take }));
  }

  private static getItemName(item: BlueprintTreeItem): string {
    if (item.variants?.length) return item.variants[0].name;
    return item.name ?? "";
  }

  private static findByName(items: BlueprintTreeItem[], name: string): BlueprintTreeItem | undefined {
    return items.find(item => this.getItemName(item) === name);
  }

  /** Extract the display name from a tree item */
  static getNameFromItem(item?: BlueprintTreeItem): string {
    if (!item) return "";
    return this.getItemName(item);
  }

  /** Find a blueprint by name, searching root level */
  static async findBlueprint(name: string): Promise<BlueprintTreeItem | undefined> {
    try {
      const rootResult = await mcpClientManager.callTool("cms", "get-document-blueprint-root", {
        cursor: this.cursor(),
      });
      if (rootResult.isError) return undefined;

      const rootData = extractChainedResult(rootResult);
      const items: BlueprintTreeItem[] = rootData?.items ?? [];

      const match = this.findByName(items, name);
      if (match) return match;

      // Check children of each root item (blueprint folders)
      for (const item of items) {
        if (item.hasChildren) {
          try {
            const childResult = await mcpClientManager.callTool("cms", "get-document-blueprint-children", {
              parentId: item.id,
              cursor: this.cursor(),
            });
            if (!childResult.isError) {
              const childData = extractChainedResult(childResult);
              const children: BlueprintTreeItem[] = childData?.items ?? [];
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

  /** List root-level blueprints */
  static async listBlueprints(take = 100): Promise<BlueprintTreeItem[]> {
    const result = await mcpClientManager.callTool("cms", "get-document-blueprint-root", {
      cursor: this.cursor(0, take),
    });
    if (result.isError) return [];
    const data = extractChainedResult(result);
    return data?.items ?? [];
  }

  /** Clean up a blueprint by name — finds it and permanently deletes */
  static async cleanup(name: string): Promise<void> {
    try {
      const item = await this.findBlueprint(name);
      if (item) {
        try {
          await mcpClientManager.callTool("cms", "delete-document-blueprint", { id: item.id });
        } catch (error) {
          console.log(`Error deleting blueprint '${name}':`, error);
        }
      }
    } catch (error) {
      console.log(`Error cleaning up blueprint '${name}':`, error);
    }
  }
}
