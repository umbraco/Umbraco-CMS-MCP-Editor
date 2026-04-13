import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initTranslationTestState,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import createVariantTool from "../post/create-variant.js";

const elicitation = createElicitation();

describe("create-variant", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let multiLanguage: boolean;
  let secondaryCulture: string;
  let testPageId: string | undefined;

  beforeAll(async () => {
    const state = await initTranslationTestState(extra);
    multiLanguage = state.multiLanguage;
    secondaryCulture = state.secondaryCulture;
    testPageId = state.testPageId;
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should create a language variant for a page", async () => {
    if (!multiLanguage || !testPageId) {
      console.warn("Skipping: requires multi-language site and test page");
      return;
    }

    const result = await createVariantTool.handler(
      { id: testPageId, culture: secondaryCulture, values: undefined },
      extra,
    );

    if (result.isError) {
      const errData = getStructuredContent(result) as any;
      const errText = typeof errData === "string" ? errData : JSON.stringify(errData);
      if (errText.includes("already exists")) {
        console.warn("Skipping: variant already exists on test page");
        return;
      }
    }

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(data.culture).toBe(secondaryCulture);
    expect(data.message).toContain(secondaryCulture);
  }, 30000);

  it("should cancel create-variant when elicitation is rejected", async () => {
    if (!multiLanguage || !testPageId) {
      console.warn("Skipping: requires multi-language site and test page");
      return;
    }

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      createVariantTool.handler(
        { id: testPageId!, culture: secondaryCulture, values: undefined },
        extra,
      ),
    );
  }, 30000);
});
