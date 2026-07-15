/**
 * Element Builder — fluent API for creating test Library elements
 * (Umbraco 18 Library section). Elements require a creatable element type;
 * if none is supplied via withElementType(), the builder provisions a
 * throwaway one (Textstring "title" property, allowedInLibrary: true).
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { ElementTestHelper } from "./element-test-helper.js";

export class ElementBuilder {
  private name: string | null = null;
  private parentId: string | null = null;
  private elementTypeId: string | null = null;
  private propertyAlias: string | null = null;
  private ownsElementType = false;
  private createdId: string | null = null;

  withName(name: string): ElementBuilder {
    this.name = name;
    return this;
  }

  withParent(parentId: string): ElementBuilder {
    this.parentId = parentId;
    return this;
  }

  /** Use an existing element type instead of provisioning a throwaway one. */
  withElementType(elementTypeId: string, propertyAlias?: string): ElementBuilder {
    this.elementTypeId = elementTypeId;
    this.propertyAlias = propertyAlias ?? null;
    this.ownsElementType = false;
    return this;
  }

  /** Create the Library element via chained CMS tool */
  async create(): Promise<ElementBuilder> {
    if (!this.name) {
      throw new Error("Element must have a name. Call withName() first.");
    }

    if (!this.elementTypeId) {
      const fixture = await ElementTestHelper.createElementType(`_Test Element Type for ${this.name}`);
      this.elementTypeId = fixture.id;
      this.propertyAlias = fixture.propertyAlias;
      this.ownsElementType = true;
    }

    const args: Record<string, unknown> = {
      documentTypeId: this.elementTypeId,
      name: this.name,
      values: [],
    };
    if (this.parentId) args.parentId = this.parentId;

    const result = await mcpClientManager.callTool("cms", "create-element", args);
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create element: ${JSON.stringify(errorData)}`);
    }
    const created = extractChainedResult(result);
    this.createdId = created?.id ?? null;

    // If no ID returned, try to find by name
    if (!this.createdId) {
      const found = await ElementTestHelper.findByName(this.name);
      if (found) {
        this.createdId = found.id;
      }
    }

    if (!this.createdId) {
      throw new Error(`Failed to find created element with name: ${this.name}`);
    }

    return this;
  }

  getId(): string {
    if (!this.createdId) {
      throw new Error("No element has been created yet");
    }
    return this.createdId;
  }

  /** The element type ID used to create this element (either supplied or provisioned) */
  getElementTypeId(): string {
    if (!this.elementTypeId) {
      throw new Error("No element type set. Call create() (or withElementType()) first.");
    }
    return this.elementTypeId;
  }

  /** The alias of a text property on this element's type, usable with edit-element */
  getPropertyAlias(): string {
    if (!this.propertyAlias) {
      throw new Error("No property alias available for this element's type.");
    }
    return this.propertyAlias;
  }

  /** Delete the throwaway element type this builder provisioned (no-op if withElementType() supplied an existing type) */
  async cleanupElementType(): Promise<void> {
    if (this.ownsElementType && this.elementTypeId) {
      await ElementTestHelper.cleanupElementType(this.elementTypeId);
      this.ownsElementType = false;
    }
  }
}
