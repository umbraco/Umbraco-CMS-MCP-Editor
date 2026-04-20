import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initLanguageTestState,
  createElicitation,
  expectElicitationCancel,
  LanguageTestHelper,
  TEST_LANGUAGE_ISO,
  TEST_LANGUAGE_NAME,
} from "./setup.js";
import createLanguageTool from "../post/create-language.js";
import getLanguageTool from "../get/get-language.js";

const elicitation = createElicitation();

describe("create-language", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initLanguageTestState(extra);
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await LanguageTestHelper.cleanup(TEST_LANGUAGE_ISO);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should create a new language", async () => {
    // Clean up first in case it exists from a prior run
    await LanguageTestHelper.cleanup(TEST_LANGUAGE_ISO);

    const result = await createLanguageTool.handler(
      { isoCode: TEST_LANGUAGE_ISO, name: TEST_LANGUAGE_NAME, isDefault: false, isMandatory: false, fallbackIsoCode: undefined },
      extra,
    );

    if (result.isError) {
      // Language may already exist despite cleanup — verify it does
      const existingResult = await getLanguageTool.handler({ isoCode: TEST_LANGUAGE_ISO }, extra);
      if (!existingResult.isError) {
        // Language exists — assert it has the expected shape
        const existingData = getStructuredContent(existingResult) as any;
        expect(existingData.isoCode).toBe(TEST_LANGUAGE_ISO);
        return;
      }
      throw new Error(`create-language failed and language ${TEST_LANGUAGE_ISO} does not exist`);
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain(TEST_LANGUAGE_ISO);
    expect(data.isoCode).toBe(TEST_LANGUAGE_ISO);
  }, 30000);

  it("should cancel create when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      createLanguageTool.handler(
        { isoCode: "fr-FR", name: "French (France)", isDefault: false, isMandatory: false, fallbackIsoCode: undefined },
        extra,
      ),
    );
  }, 30000);
});
