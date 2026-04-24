/**
 * Recycle Bin Builder — fluent API for creating trashed test fixtures.
 *
 * Creates a media folder (optionally with a nested child) via the chained
 * create-media-folder tool, then moves it to the recycle bin via the
 * chained move-media-to-recycle-bin tool. Media is used rather than content
 * because media folders have no doc-type restrictions and are cheap to
 * create/destroy under any Umbraco install.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { RecycleBinTestHelper } from "./recycle-bin-test-helper.js";

export class RecycleBinBuilder {
  private name: string | null = null;
  private childName: string | null = null;
  private createdId: string | null = null;
  private createdChildId: string | null = null;

  withName(name: string): RecycleBinBuilder {
    this.name = name;
    return this;
  }

  /** Attach a nested child folder before trashing, so the fixture cascades. */
  withNestedChild(childName: string): RecycleBinBuilder {
    this.childName = childName;
    return this;
  }

  private async createMediaFolder(name: string, parentId?: string): Promise<string> {
    const args: Record<string, unknown> = { name };
    if (parentId) args.parentId = parentId;
    const result = await mcpClientManager.callTool("cms", "create-media-folder", args);
    if (result.isError) {
      throw new Error(`Failed to create media folder "${name}": ${JSON.stringify(extractChainedResult(result))}`);
    }
    const created = extractChainedResult(result);
    if (!created?.id) {
      throw new Error(`create-media-folder returned no id for "${name}"`);
    }
    return created.id;
  }

  /** Create the folder (plus child, if any) then move the parent to the recycle bin. */
  async create(): Promise<RecycleBinBuilder> {
    if (!this.name) {
      throw new Error("RecycleBinBuilder must have a name. Call withName() first.");
    }

    this.createdId = await this.createMediaFolder(this.name);

    if (this.childName) {
      this.createdChildId = await this.createMediaFolder(this.childName, this.createdId);
    }

    await RecycleBinTestHelper.trashMedia(this.createdId);
    return this;
  }

  getId(): string {
    if (!this.createdId) {
      throw new Error("No trashed item has been created yet. Call create() first.");
    }
    return this.createdId;
  }

  getChildId(): string | null {
    return this.createdChildId;
  }
}
