/**
 * Media Management Builder — fluent API for creating test media folders.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { MediaManagementTestHelper, type MediaTreeItem } from "./media-management-test-helper.js";

export class MediaManagementBuilder {
  private name: string | null = null;
  private parentId: string | null = null;
  private createdId: string | null = null;

  withName(name: string): MediaManagementBuilder {
    this.name = name;
    return this;
  }

  withParent(parentId: string): MediaManagementBuilder {
    this.parentId = parentId;
    return this;
  }

  /** Create a media folder via chained CMS tool */
  async create(): Promise<MediaManagementBuilder> {
    if (!this.name) {
      throw new Error("Media folder must have a name. Call withName() first.");
    }

    const args: Record<string, unknown> = { name: this.name };
    if (this.parentId) args.parentId = this.parentId;

    const result = await mcpClientManager.callTool("cms", "create-media-folder", args);
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create media folder: ${JSON.stringify(errorData)}`);
    }

    const created = extractChainedResult(result);
    this.createdId = created?.id ?? null;

    // If no ID returned, try to find by name
    if (!this.createdId) {
      const found = await MediaManagementTestHelper.findMediaByName(this.name);
      if (found) {
        this.createdId = found.id;
      }
    }

    if (!this.createdId) {
      throw new Error(`Failed to find created media folder with name: ${this.name}`);
    }

    return this;
  }

  getId(): string {
    if (!this.createdId) {
      throw new Error("No media folder has been created yet");
    }
    return this.createdId;
  }
}
