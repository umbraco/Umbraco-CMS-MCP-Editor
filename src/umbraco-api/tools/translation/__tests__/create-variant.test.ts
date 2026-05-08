import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initTranslationTestState,
} from "./setup.js";
import createVariantTool from "../post/create-variant.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { TranslationTestHelper } from "./helpers/translation-test-helper.js";
import { findInvariantDoctypeInfo } from "./helpers/invariant-doctype.js";
import { VariantDoctypeFixture } from "./helpers/variant-doctype-fixture.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";

describe("create-variant", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let defaultCulture: string;
  let secondaryCulture: string;

  // Variant-capable doctype and page for the happy-path test
  const variantDocTypeFixture = new VariantDoctypeFixture();
  let variantPageId: string | undefined;

  beforeAll(async () => {
    const state = await initTranslationTestState(extra);
    defaultCulture = state.defaultCulture;
    secondaryCulture = state.secondaryCulture;

    // Create a variant-capable doctype and a page to run the happy-path on.
    // Must use fixture.createPage() because ContentBuilder passes culture:null
    // which Umbraco rejects for variesByCulture=true doctypes.
    await variantDocTypeFixture.create();
    variantPageId = await variantDocTypeFixture.createPage(
      `_test-create-variant-${Date.now()}`,
      defaultCulture,
    );
  }, 120000);

  afterAll(async () => {
    if (variantPageId) await ContentTestHelper.cleanupById(variantPageId);
    await variantDocTypeFixture.cleanup();
  }, 60000);

  it("should create a language variant for a page", async () => {
    expect(secondaryCulture).toBeTruthy();
    expect(variantPageId).toBeTruthy();

    const result = await createVariantTool.handler(
      { id: variantPageId!, culture: secondaryCulture, values: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(variantPageId);
    expect(data.culture).toBe(secondaryCulture);
    expect(data.message).toContain(secondaryCulture);
  }, 30000);

  describe("invariant doctype pre-flight", () => {
    let invariantDocTypeId: string | undefined;
    let invariantPageId: string | undefined;

    beforeAll(async () => {
      const info = await findInvariantDoctypeInfo();
      if (!info) return;
      invariantDocTypeId = info.id;

      const builder = new ContentBuilder()
        .withName(`_test-invariant-variant-${Date.now()}`)
        .withDocumentType(invariantDocTypeId);
      if (info.parentId) builder.withParent(info.parentId);
      const doc = await builder.create();
      invariantPageId = doc.getId();
    }, 60000);

    afterAll(async () => {
      if (invariantPageId) await TranslationTestHelper.cleanupById(invariantPageId);
    }, 30000);

    it("returns a clear error when the document type is invariant", async () => {
      if (!invariantDocTypeId || !invariantPageId) {
        console.warn("Skipping: no invariant document type found in this Umbraco instance");
        return;
      }

      // Use the actual secondary culture (not a hardcoded one that may not exist)
      const result = await callTool(
        createVariantTool,
        { id: invariantPageId, culture: secondaryCulture },
        {},
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        status: 400,
        title: expect.stringMatching(/invariant|culture/i),
      });
    }, 30000);
  });
});
