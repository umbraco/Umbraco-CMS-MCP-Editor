/**
 * Blueprint Builder — fluent API for creating test blueprints via chained CMS tools.
 *
 * Blueprints are created from existing pages, so this builder creates a source
 * page first (via ContentBuilder), then creates a blueprint from it.
 *
 * Usage:
 *   const bp = await new BlueprintBuilder()
 *     .withName("Test Blueprint")
 *     .withSourcePage(pageId)
 *     .create();
 *
 *   const id = bp.getId();
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { BlueprintTestHelper, type BlueprintTreeItem } from "./blueprint-test-helper.js";

export class BlueprintBuilder {
  private name: string | null = null;
  private sourcePageId: string | null = null;
  private createdItem: BlueprintTreeItem | null = null;
  private createdId: string | null = null;

  withName(name: string): BlueprintBuilder {
    this.name = name;
    return this;
  }

  withSourcePage(pageId: string): BlueprintBuilder {
    this.sourcePageId = pageId;
    return this;
  }

  /** Create the blueprint via chained CMS tool */
  async create(): Promise<BlueprintBuilder> {
    if (!this.name) {
      throw new Error("Blueprint must have a name. Call withName() first.");
    }
    if (!this.sourcePageId) {
      throw new Error("Blueprint must have a source page. Call withSourcePage() first.");
    }

    const result = await mcpClientManager.callTool("cms", "create-document-blueprint-from-document", {
      document: { id: this.sourcePageId },
      name: this.name,
    });
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create blueprint: ${JSON.stringify(errorData)}`);
    }

    const created = extractChainedResult(result);
    this.createdId = created?.id ?? null;

    // If the CMS didn't return an ID, find by name
    if (!this.createdId) {
      const found = await BlueprintTestHelper.findBlueprint(this.name);
      if (found) {
        this.createdId = found.id;
        this.createdItem = found;
      }
    } else {
      this.createdItem = { id: this.createdId, name: this.name };
    }

    if (!this.createdId) {
      throw new Error(`Failed to find created blueprint with name: ${this.name}`);
    }

    return this;
  }

  /** Get the ID of the created blueprint */
  getId(): string {
    if (!this.createdId) {
      throw new Error("No blueprint has been created yet");
    }
    return this.createdId;
  }

  /** Get the full created item */
  getCreatedItem(): BlueprintTreeItem {
    if (!this.createdItem) {
      throw new Error("No blueprint has been created yet");
    }
    return this.createdItem;
  }

  /** Delete the created blueprint */
  async delete(): Promise<void> {
    if (!this.createdId) {
      throw new Error("No blueprint has been created yet. Cannot delete.");
    }
    await mcpClientManager.callTool("cms", "delete-document-blueprint", { id: this.createdId });
  }
}
