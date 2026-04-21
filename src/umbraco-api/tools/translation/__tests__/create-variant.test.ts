import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initTranslationTestState,
} from "./setup.js";
import createVariantTool from "../post/create-variant.js";

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

  it("should create a language variant for a page", async () => {
    expect(multiLanguage).toBe(true);
    expect(testPageId).toBeTruthy();

    const result = await createVariantTool.handler(
      { id: testPageId!, culture: secondaryCulture, values: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(data.culture).toBe(secondaryCulture);
    expect(data.message).toContain(secondaryCulture);
  }, 30000);
});
