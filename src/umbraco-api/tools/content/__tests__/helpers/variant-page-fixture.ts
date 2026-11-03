/**
 * Variant Page Fixture
 *
 * Provisions what create-page / create-and-publish-page need to be tested on a
 * multilingual site: a document type that varies by culture with one
 * culture-variant Textstring property, plus the site's default culture and a
 * non-default culture (created if the site has only one language). Reuses the
 * translation collection's VariantDoctypeFixture.
 *
 * Usage:
 *   const fixture = new VariantPageFixture();
 *   const { documentTypeId, propertyAlias, defaultCulture, secondaryCulture } = await fixture.create(extra);
 *   ...
 *   await fixture.cleanup();
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { VariantDoctypeFixture } from "../../../translation/__tests__/helpers/variant-doctype-fixture.js";
import { initTranslationTestState } from "../../../translation/__tests__/setup.js";

export interface VariantPageFixtureResult {
  documentTypeId: string;
  propertyAlias: string;
  defaultCulture: string;
  secondaryCulture: string;
}

export class VariantPageFixture {
  private readonly doctype = new VariantDoctypeFixture();

  async create(extra: Parameters<typeof initTranslationTestState>[0]): Promise<VariantPageFixtureResult> {
    const { defaultCulture, secondaryCulture } = await initTranslationTestState(extra);
    if (!defaultCulture || !secondaryCulture) {
      throw new Error("VariantPageFixture: need a default and a secondary language");
    }

    const dataTypeResult = await mcpClientManager.callTool("cms", "find-data-type", {
      editorAlias: "Umbraco.TextBox",
    });
    const dataTypeId: string | undefined = extractChainedResult(dataTypeResult)?.items?.[0]?.id;
    if (dataTypeResult.isError || !dataTypeId) {
      throw new Error("VariantPageFixture: no Textstring (Umbraco.TextBox) data type found on this Umbraco instance");
    }

    const propertyAlias = "variantTitle";
    const documentTypeId = await this.doctype.create({
      properties: [{ name: "Variant Title", alias: propertyAlias, dataTypeId, group: "Content" }],
    });

    return { documentTypeId, propertyAlias, defaultCulture, secondaryCulture };
  }

  async cleanup(): Promise<void> {
    await this.doctype.cleanup();
  }

  /** Raw CMS document, for asserting on variants and per-culture values. */
  static async getDocument(id: string): Promise<any> {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) {
      throw new Error(`VariantPageFixture: get-document-by-id failed: ${JSON.stringify(extractChainedResult(result))}`);
    }
    return extractChainedResult(result);
  }
}
