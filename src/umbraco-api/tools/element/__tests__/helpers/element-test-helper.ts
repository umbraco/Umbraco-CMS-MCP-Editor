/**
 * Element Test Helper — static utility class for managing Library elements,
 * element folders, and throwaway element types via chained CMS tools.
 */

import { randomUUID } from "node:crypto";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export interface ElementTreeItem {
  id: string;
  name?: string;
  isFolder?: boolean;
  hasChildren?: boolean;
}

export interface ElementTypeFixture {
  /** The created element type's ID (a document type with isElement: true) */
  id: string;
  /** Alias of the Textstring "title" property created on the type */
  propertyAlias: string;
}

export class ElementTestHelper {
  private static cursor(skip = 0, take = 100): string {
    return btoa(JSON.stringify({ s: skip, t: take }));
  }

  /** Find a Library element or folder by name at the Library root */
  static async findByName(name: string): Promise<ElementTreeItem | undefined> {
    try {
      const result = await mcpClientManager.callTool("cms", "get-element-root", {
        cursor: this.cursor(),
      });
      if (result.isError) return undefined;
      const data = extractChainedResult(result);
      const items = (data?.items ?? []) as any[];
      const match = items.find((item) => (item.variants?.[0]?.name ?? item.name) === name);
      if (!match) return undefined;
      return {
        id: match.id,
        name: match.variants?.[0]?.name ?? match.name,
        isFolder: match.isFolder ?? false,
        hasChildren: match.hasChildren ?? false,
      };
    } catch {
      return undefined;
    }
  }

  /** Move a Library element or folder to the recycle bin (best-effort; tries both element and folder endpoints) */
  static async cleanup(id: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "move-element-to-recycle-bin", { id });
    } catch {
      // May be a folder, or already trashed
    }
    try {
      await mcpClientManager.callTool("cms", "move-element-folder-to-recycle-bin", { id });
    } catch {
      // Best-effort
    }
  }

  /** Find and remove a Library element or folder by name */
  static async cleanupByName(name: string): Promise<void> {
    const item = await this.findByName(name);
    if (item) {
      await this.cleanup(item.id);
    }
  }

  /**
   * Create a throwaway, creatable element type — a single Textstring "title"
   * property, `allowedInLibrary: true` so create-element can use it at the
   * Library root. Returns the type's ID and the property alias so callers can
   * set/read values on elements of this type. Clean up with cleanupElementType.
   */
  static async createElementType(namePrefix = "_Test Element Type"): Promise<ElementTypeFixture> {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 10);
    const name = `${namePrefix} ${suffix}`;
    const alias = `testElementType${suffix}`;
    const propertyAlias = "title";

    const dataTypeResult = await mcpClientManager.callTool("cms", "find-data-type", {
      editorAlias: "Umbraco.TextBox",
    });
    if (dataTypeResult.isError) {
      throw new Error(`find-data-type failed: ${JSON.stringify(extractChainedResult(dataTypeResult))}`);
    }
    const dataTypeData = extractChainedResult(dataTypeResult);
    const dataTypeId: string | undefined = dataTypeData?.items?.[0]?.id;
    if (!dataTypeId) {
      throw new Error("No Textstring (Umbraco.TextBox) data type found on this Umbraco instance");
    }

    const result = await mcpClientManager.callTool("cms", "create-element-type", {
      name,
      alias,
      icon: "icon-plugin",
      compositions: [],
      allowedInLibrary: true,
      properties: [{ name: "Title", alias: propertyAlias, dataTypeId, group: "Content" }],
    });
    if (result.isError) {
      throw new Error(`create-element-type failed: ${JSON.stringify(extractChainedResult(result))}`);
    }
    const created = extractChainedResult(result);
    const id: string | undefined = created?.id;
    if (!id) {
      throw new Error("create-element-type did not return an id");
    }

    return { id, propertyAlias };
  }

  /** Delete an element type created via createElementType */
  static async cleanupElementType(id: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "delete-document-type", { id });
    } catch {
      // Best-effort
    }
  }
}
