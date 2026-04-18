/**
 * Media Management Builder — fluent API for creating test media folders and files.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { MediaManagementTestHelper, type MediaTreeItem } from "./media-management-test-helper.js";

// Minimal 1x1 transparent PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export class MediaManagementBuilder {
  private name: string | null = null;
  private parentId: string | null = null;
  private createdId: string | null = null;
  private kind: "folder" | "file" = "folder";
  private fileBase64: string = TINY_PNG_BASE64;
  private mediaTypeName: string = "Image";

  withName(name: string): MediaManagementBuilder {
    this.name = name;
    return this;
  }

  withParent(parentId: string): MediaManagementBuilder {
    this.parentId = parentId;
    return this;
  }

  /** Switch builder to create a media file (defaults to a tiny 1x1 PNG as Image). */
  asFile(base64?: string, mediaTypeName = "Image"): MediaManagementBuilder {
    this.kind = "file";
    if (base64) this.fileBase64 = base64;
    this.mediaTypeName = mediaTypeName;
    return this;
  }

  /** Create a media folder or file via chained CMS tool */
  async create(): Promise<MediaManagementBuilder> {
    if (!this.name) {
      throw new Error("Media item must have a name. Call withName() first.");
    }

    if (this.kind === "file") {
      const args: Record<string, unknown> = {
        sourceType: "base64",
        name: this.name,
        mediaTypeName: this.mediaTypeName,
        fileAsBase64: this.fileBase64,
      };
      if (this.parentId) args.parentId = this.parentId;

      const result = await mcpClientManager.callTool("cms", "create-media", args);
      if (result.isError) {
        const errorData = extractChainedResult(result);
        throw new Error(`Failed to create media file: ${JSON.stringify(errorData)}`);
      }
      const created = extractChainedResult(result);
      this.createdId = created?.id ?? null;
    } else {
      const args: Record<string, unknown> = { name: this.name };
      if (this.parentId) args.parentId = this.parentId;

      const result = await mcpClientManager.callTool("cms", "create-media-folder", args);
      if (result.isError) {
        const errorData = extractChainedResult(result);
        throw new Error(`Failed to create media folder: ${JSON.stringify(errorData)}`);
      }
      const created = extractChainedResult(result);
      this.createdId = created?.id ?? null;
    }

    // If no ID returned, try to find by name
    if (!this.createdId) {
      const found = await MediaManagementTestHelper.findMediaByName(this.name);
      if (found) {
        this.createdId = found.id;
      }
    }

    if (!this.createdId) {
      throw new Error(`Failed to find created media item with name: ${this.name}`);
    }

    return this;
  }

  getId(): string {
    if (!this.createdId) {
      throw new Error("No media item has been created yet");
    }
    return this.createdId;
  }
}
