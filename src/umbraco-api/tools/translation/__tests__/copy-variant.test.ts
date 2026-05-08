import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initTranslationTestState,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import copyVariantTool from "../post/copy-variant.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { TranslationTestHelper } from "./helpers/translation-test-helper.js";
import { findInvariantDoctypeInfo } from "./helpers/invariant-doctype.js";
import { VariantDoctypeFixture } from "./helpers/variant-doctype-fixture.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";

const elicitation = createElicitation();

describe("copy-variant", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let defaultCulture: string;
  let secondaryCulture: string;

  // Variant-capable doctype and page for the happy-path tests
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
      `_test-copy-variant-${Date.now()}`,
      defaultCulture,
    );
  }, 120000);

  afterAll(async () => {
    if (variantPageId) await ContentTestHelper.cleanupById(variantPageId);
    await variantDocTypeFixture.cleanup();
    elicitation.cleanup();
  }, 60000);

  beforeEach(() => { elicitation.reset(); });

  it("should copy content from default to secondary culture", async () => {
    expect(variantPageId).toBeTruthy();

    const result = await copyVariantTool.handler(
      { id: variantPageId!, sourceCulture: defaultCulture, targetCulture: secondaryCulture },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(variantPageId);
    expect(data.sourceCulture).toBe(defaultCulture);
    expect(data.targetCulture).toBe(secondaryCulture);
    expect(data.copiedFields).toBeInstanceOf(Array);
    expect(data.message).toContain(secondaryCulture);
  }, 30000);

  it("should cancel copy-variant when elicitation is rejected", async () => {
    expect(variantPageId).toBeTruthy();

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      copyVariantTool.handler(
        { id: variantPageId!, sourceCulture: defaultCulture, targetCulture: secondaryCulture },
        extra,
      ),
    );
  }, 30000);

  describe("invariant doctype pre-flight", () => {
    let invariantDocTypeId: string | undefined;
    let invariantPageId: string | undefined;

    beforeAll(async () => {
      const info = await findInvariantDoctypeInfo();
      if (!info) return;
      invariantDocTypeId = info.id;

      const builder = new ContentBuilder()
        .withName(`_test-invariant-copy-variant-${Date.now()}`)
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

      // Use the actual default/secondary cultures (not hardcoded ones that may not exist)
      const result = await callTool(
        copyVariantTool,
        { id: invariantPageId, sourceCulture: defaultCulture, targetCulture: secondaryCulture },
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
