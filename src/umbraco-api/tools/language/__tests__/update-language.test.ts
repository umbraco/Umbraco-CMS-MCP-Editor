import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initLanguageTestState,
  LanguageTestHelper,
  LanguageBuilder,
  TEST_LANGUAGE_ISO,
  TEST_LANGUAGE_NAME,
} from "./setup.js";
import updateLanguageTool from "../put/update-language.js";

describe("update-language", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initLanguageTestState(extra);
  }, 60000);

  afterEach(async () => {
    await LanguageTestHelper.cleanup(TEST_LANGUAGE_ISO);
  }, 30000);

  it("should update a language", async () => {
    // Ensure the test language exists
    await LanguageTestHelper.cleanup(TEST_LANGUAGE_ISO);
    await new LanguageBuilder()
      .withIsoCode(TEST_LANGUAGE_ISO)
      .withName(TEST_LANGUAGE_NAME)
      .create();

    const result = await updateLanguageTool.handler(
      { isoCode: TEST_LANGUAGE_ISO, isMandatory: false, isDefault: false, fallbackIsoCode: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.isoCode).toBe(TEST_LANGUAGE_ISO);
    expect(data.message).toContain("updated");
  }, 30000);
});
