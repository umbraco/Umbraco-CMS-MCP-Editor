/**
 * Dictionary Builder — fluent API for creating test dictionary items via chained CMS tools.
 *
 * Usage:
 *   const item = await new DictionaryBuilder()
 *     .withName("test-key")
 *     .withTranslation("en-US", "Test value")
 *     .create();
 *
 *   const id = item.getId();
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { DictionaryTestHelper, type DictionaryTreeItem } from "./dictionary-test-helper.js";

interface DictionaryTranslation {
  isoCode: string;
  translation: string;
}

export class DictionaryBuilder {
  private name: string | null = null;
  private translations: DictionaryTranslation[] = [];
  private parentId: string | null = null;
  private createdId: string | null = null;
  private createdItem: DictionaryTreeItem | null = null;

  withName(name: string): DictionaryBuilder {
    this.name = name;
    return this;
  }

  withTranslation(isoCode: string, translation: string): DictionaryBuilder {
    this.translations.push({ isoCode, translation });
    return this;
  }

  withParent(parentId: string): DictionaryBuilder {
    this.parentId = parentId;
    return this;
  }

  /** Create the dictionary item via chained CMS tool */
  async create(): Promise<DictionaryBuilder> {
    if (!this.name) {
      throw new Error("Dictionary item must have a name. Call withName() first.");
    }

    const args: Record<string, unknown> = {
      name: this.name,
      translations: this.translations,
    };
    if (this.parentId) args.parentId = this.parentId;

    const result = await mcpClientManager.callTool("cms", "create-dictionary", args);
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create dictionary item: ${JSON.stringify(errorData)}`);
    }

    const created = extractChainedResult(result);
    this.createdId = created?.id ?? null;

    // If no ID returned, find by name
    if (!this.createdId) {
      const found = await DictionaryTestHelper.findDictionaryItem(this.name);
      if (found) {
        this.createdId = found.id;
        this.createdItem = found;
      }
    } else {
      this.createdItem = { id: this.createdId, name: this.name };
    }

    if (!this.createdId) {
      throw new Error(`Failed to find created dictionary item with name: ${this.name}`);
    }

    return this;
  }

  /** Get the ID of the created dictionary item */
  getId(): string {
    if (!this.createdId) {
      throw new Error("No dictionary item has been created yet");
    }
    return this.createdId;
  }

  /** Get the full created item */
  getCreatedItem(): DictionaryTreeItem {
    if (!this.createdItem) {
      throw new Error("No dictionary item has been created yet");
    }
    return this.createdItem;
  }

  /** Delete the created dictionary item */
  async delete(): Promise<void> {
    if (!this.createdId) {
      throw new Error("No dictionary item has been created yet. Cannot delete.");
    }
    await mcpClientManager.callTool("cms", "delete-dictionary-item", { id: this.createdId });
  }
}
