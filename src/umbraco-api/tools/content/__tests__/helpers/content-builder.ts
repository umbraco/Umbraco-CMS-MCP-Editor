/**
 * Content Builder — fluent API for creating test documents via chained CMS tools.
 *
 * Usage:
 *   const doc = await new ContentBuilder()
 *     .withName("Test Page")
 *     .withDocumentType(docTypeId)
 *     .create();
 *
 *   const id = doc.getId();
 *   await doc.publish();
 *   await doc.moveToRecycleBin();
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { ContentTestHelper, type DocumentTreeItem } from "./content-test-helper.js";

interface DocumentValue {
  alias: string;
  value: unknown;
  culture: string | null;
  segment: string | null;
}

interface DocumentVariant {
  name: string;
  culture: string | null;
  segment: string | null;
}

export class ContentBuilder {
  private values: DocumentValue[] = [];
  private variants: DocumentVariant[] = [];
  private parentId: string | null = null;
  private documentTypeId: string | null = null;
  private createdItem: DocumentTreeItem | null = null;

  withName(name: string): ContentBuilder {
    this.variants = [{ name, culture: null, segment: null }];
    return this;
  }

  withParent(parentId: string): ContentBuilder {
    this.parentId = parentId;
    return this;
  }

  withDocumentType(documentTypeId: string): ContentBuilder {
    this.documentTypeId = documentTypeId;
    return this;
  }

  withValue(alias: string, value: unknown, culture: string | null = null, segment: string | null = null): ContentBuilder {
    this.values.push({ alias, value, culture, segment });
    return this;
  }

  withVariant(name: string, culture: string | null = null, segment: string | null = null): ContentBuilder {
    this.variants.push({ name, culture, segment });
    return this;
  }

  /** Create the document via chained CMS tool and find the created item */
  async create(): Promise<ContentBuilder> {
    if (!this.documentTypeId) {
      throw new Error("Document type ID is required. Call withDocumentType() first.");
    }

    const name = this.variants[0]?.name;
    if (!name) {
      throw new Error("Document must have a name. Call withName() first.");
    }

    const args: Record<string, unknown> = {
      documentTypeId: this.documentTypeId,
      name,
      values: this.values,
    };
    if (this.parentId) args.parentId = this.parentId;

    const result = await mcpClientManager.callTool("cms", "create-document", args);
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create document: ${JSON.stringify(errorData)}`);
    }

    // Try to get the ID from the create response
    const created = extractChainedResult(result);
    if (created?.id) {
      this.createdItem = { id: created.id, name, variants: [{ name }] };
    } else {
      // Fall back to searching by name, scoped to parent if set
      this.createdItem = await ContentTestHelper.findDocument(name, this.parentId ?? undefined) ?? null;
    }

    if (!this.createdItem) {
      throw new Error(`Failed to find created document with name: ${name}`);
    }

    return this;
  }

  /** Move the document to the recycle bin */
  async moveToRecycleBin(): Promise<ContentBuilder> {
    if (!this.createdItem) {
      throw new Error("No document has been created yet. Cannot move to recycle bin.");
    }
    await mcpClientManager.callTool("cms", "move-document-to-recycle-bin", { id: this.createdItem.id });
    return this;
  }

  /** Publish the document */
  async publish(): Promise<ContentBuilder> {
    if (!this.createdItem) {
      throw new Error("No document has been created yet. Cannot publish.");
    }
    await mcpClientManager.callTool("cms", "publish-document", {
      id: this.createdItem.id,
      data: { publishSchedules: [{ culture: null }] },
    });
    return this;
  }

  /** Update the document's name */
  async updateName(newName: string): Promise<ContentBuilder> {
    if (!this.createdItem) {
      throw new Error("No document has been created yet. Cannot update name.");
    }

    // Get the full document to preserve existing values
    const getResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: this.createdItem.id });
    if (getResult.isError) {
      throw new Error("Failed to get document for update");
    }
    const doc = extractChainedResult(getResult);

    // Update the variant name
    const variants = doc.variants ?? [];
    if (variants.length > 0) {
      variants[0].name = newName;
    }

    await mcpClientManager.callTool("cms", "update-document", {
      id: this.createdItem.id,
      data: {
        template: doc.template,
        values: doc.values ?? [],
        variants,
      },
    });

    // Update local state
    if (this.createdItem.variants?.length) {
      this.createdItem.variants[0].name = newName;
    }

    return this;
  }

  /** Get the ID of the created document */
  getId(): string {
    if (!this.createdItem) {
      throw new Error("No document has been created yet");
    }
    return this.createdItem.id;
  }

  /** Get the full created item */
  getCreatedItem(): DocumentTreeItem {
    if (!this.createdItem) {
      throw new Error("No document has been created yet");
    }
    return this.createdItem;
  }
}
