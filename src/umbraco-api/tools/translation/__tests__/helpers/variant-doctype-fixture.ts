/**
 * Variant Doctype Fixture
 *
 * Creates a minimal document type with variesByCulture=true for use in
 * translation happy-path tests. The Clean starter kit seed ships only
 * invariant doctypes, so tests that exercise create-variant / copy-variant
 * need to provision their own variant-capable doctype.
 *
 * Usage:
 *   const fixture = new VariantDoctypeFixture();
 *   const docTypeId = await fixture.create();
 *   const pageId = await fixture.createPage("My Page", defaultCulture);
 *   await fixture.cleanup();
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { ContentTestHelper } from "../../../content/__tests__/helpers/content-test-helper.js";

export class VariantDoctypeFixture {
  private createdId: string | null = null;

  /** Creates the doctype and returns its ID. */
  async create(): Promise<string> {
    const alias = `_test_variant_doctype_${Date.now()}`;

    // Step 1: create a minimal doctype (create-document-type does not expose
    // variesByCulture, so we create then update).
    const createResult = await mcpClientManager.callTool("cms", "create-document-type", {
      name: alias,
      alias,
      icon: "icon-document",
      allowedAsRoot: true,
      compositions: [],
      allowedDocumentTypes: [],
      properties: [],
    });

    if (createResult.isError) {
      throw new Error(
        `VariantDoctypeFixture: create-document-type failed: ${JSON.stringify(extractChainedResult(createResult))}`,
      );
    }

    const created = extractChainedResult(createResult);
    const id: string = created?.id;
    if (!id) {
      throw new Error("VariantDoctypeFixture: create-document-type did not return an id");
    }

    // Step 2: fetch the full doctype so we can pass all required fields to update
    const getResult = await mcpClientManager.callTool("cms", "get-document-type-by-id", { id });
    if (getResult.isError) {
      throw new Error("VariantDoctypeFixture: get-document-type-by-id failed after create");
    }
    const dt = extractChainedResult(getResult) as any;

    // Step 3: update to enable variesByCulture
    const updateResult = await mcpClientManager.callTool("cms", "update-document-type", {
      id,
      data: {
        alias: dt.alias,
        name: dt.name,
        description: dt.description ?? null,
        icon: dt.icon,
        allowedAsRoot: dt.allowedAsRoot,
        variesByCulture: true,
        variesBySegment: dt.variesBySegment,
        collection: dt.collection ?? null,
        isElement: dt.isElement,
        properties: dt.properties ?? [],
        containers: dt.containers ?? [],
        allowedTemplates: dt.allowedTemplates ?? [],
        defaultTemplate: dt.defaultTemplate ?? null,
        cleanup: dt.cleanup ?? { preventCleanup: false, keepAllVersionsNewerThanDays: null, keepLatestVersionPerDayForDays: null },
        allowedDocumentTypes: dt.allowedDocumentTypes ?? [],
        compositions: dt.compositions ?? [],
      },
    });

    if (updateResult.isError) {
      // Best-effort cleanup then rethrow
      await mcpClientManager.callTool("cms", "delete-document-type", { id }).catch(() => undefined);
      throw new Error(
        `VariantDoctypeFixture: update-document-type (variesByCulture) failed: ${JSON.stringify(extractChainedResult(updateResult))}`,
      );
    }

    this.createdId = id;
    return id;
  }

  /** Deletes the doctype created by this fixture. */
  async cleanup(): Promise<void> {
    if (!this.createdId) return;
    await mcpClientManager.callTool("cms", "delete-document-type", { id: this.createdId }).catch(() => undefined);
    this.createdId = null;
  }

  /**
   * Creates a test page under this variant doctype using the given default culture.
   * For variesByCulture=true doctypes, the document creation must include a
   * cultures array — ContentBuilder uses culture:null which Umbraco rejects.
   */
  async createPage(name: string, defaultCulture: string): Promise<string> {
    if (!this.createdId) {
      throw new Error("VariantDoctypeFixture: call create() before createPage()");
    }

    const result = await mcpClientManager.callTool("cms", "create-document", {
      documentTypeId: this.createdId,
      name,
      cultures: [defaultCulture],
      values: [],
    });

    if (result.isError) {
      throw new Error(
        `VariantDoctypeFixture: create-document failed: ${JSON.stringify(extractChainedResult(result))}`,
      );
    }

    const created = extractChainedResult(result);
    if (created?.id) return created.id as string;

    // Fall back to finding by name
    const found = await ContentTestHelper.findDocument(name);
    if (found?.id) return found.id;

    throw new Error(`VariantDoctypeFixture: could not find created page "${name}"`);
  }

  get id(): string | null {
    return this.createdId;
  }
}
