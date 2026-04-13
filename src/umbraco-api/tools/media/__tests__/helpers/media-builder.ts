/**
 * Media Builder — fluent API for creating test media folders via chained CMS tools.
 *
 * Creates Folder-type media items (no binary upload required) which makes them
 * suitable for integration test setup and teardown.
 *
 * Usage:
 *   const folder = await new MediaBuilder()
 *     .withName("_Test Folder")
 *     .create();
 *
 *   const id = folder.getId();
 *   await folder.delete();
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { MediaTestHelper, type MediaTreeItem } from "./media-test-helper.js";

const TEST_MEDIA_FOLDER_NAME = "_Test Media Folder";

export class MediaBuilder {
  private name: string = TEST_MEDIA_FOLDER_NAME;
  private parentId: string | undefined = undefined;
  private createdItem: MediaTreeItem | null = null;

  withName(name: string): MediaBuilder {
    this.name = name;
    return this;
  }

  withParent(parentId: string): MediaBuilder {
    this.parentId = parentId;
    return this;
  }

  /**
   * Create a media folder via the chained CMS create-media-folder tool.
   * Extracts the ID from the create response directly, since the media library
   * may contain hundreds of items making name-based search unreliable.
   */
  async create(): Promise<MediaBuilder> {
    const args: Record<string, unknown> = { name: this.name };
    if (this.parentId) {
      args.parent = { id: this.parentId };
    } else {
      args.parent = null;
    }

    const result = await mcpClientManager.callTool("cms", "create-media-folder", args);
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create media folder: ${JSON.stringify(errorData)}`);
    }

    const created = extractChainedResult(result);

    // The CMS create-media-folder returns the created item with an id field
    if (created?.id) {
      this.createdItem = {
        id: created.id,
        name: created.name ?? this.name,
      };
      return this;
    }

    // Fallback: search by name in recent children
    this.createdItem = await MediaTestHelper.findMediaByName(this.name) ?? null;

    if (!this.createdItem) {
      throw new Error(`Failed to find created media folder with name: ${this.name}`);
    }

    return this;
  }

  /** Delete the created media folder */
  async delete(): Promise<MediaBuilder> {
    if (!this.createdItem) {
      throw new Error("No media folder has been created yet. Cannot delete.");
    }
    await mcpClientManager.callTool("cms", "delete-media", { id: this.createdItem.id });
    this.createdItem = null;
    return this;
  }

  /** Get the ID of the created folder */
  getId(): string {
    if (!this.createdItem) {
      throw new Error("No media folder has been created yet. Call create() first.");
    }
    return this.createdItem.id;
  }

  /** Get the full created item */
  getCreatedItem(): MediaTreeItem {
    if (!this.createdItem) {
      throw new Error("No media folder has been created yet.");
    }
    return this.createdItem;
  }
}
