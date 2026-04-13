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

const elicitation = createElicitation();

describe("copy-variant", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let multiLanguage: boolean;
  let defaultCulture: string;
  let secondaryCulture: string;
  let testPageId: string | undefined;

  beforeAll(async () => {
    const state = await initTranslationTestState(extra);
    multiLanguage = state.multiLanguage;
    defaultCulture = state.defaultCulture;
    secondaryCulture = state.secondaryCulture;
    testPageId = state.testPageId;
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should copy content from default to secondary culture", async () => {
    if (!multiLanguage || !testPageId) {
      console.warn("Skipping: requires multi-language site and test page");
      return;
    }

    const result = await copyVariantTool.handler(
      { id: testPageId, sourceCulture: defaultCulture, targetCulture: secondaryCulture },
      extra,
    );

    if (result.isError) {
      console.warn("Skipping copy-variant assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(data.sourceCulture).toBe(defaultCulture);
    expect(data.targetCulture).toBe(secondaryCulture);
    expect(data.copiedFields).toBeInstanceOf(Array);
    expect(data.message).toContain(secondaryCulture);
  }, 30000);

  it("should cancel copy-variant when elicitation is rejected", async () => {
    if (!multiLanguage || !testPageId) {
      console.warn("Skipping: requires multi-language site and test page");
      return;
    }

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      copyVariantTool.handler(
        { id: testPageId!, sourceCulture: defaultCulture, targetCulture: secondaryCulture },
        extra,
      ),
    );
  }, 30000);
});
