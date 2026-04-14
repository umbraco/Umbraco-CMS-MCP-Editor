import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initLanguageTestState,
  createElicitation,
  expectElicitationCancel,
  LanguageTestHelper,
  LanguageBuilder,
  TEST_LANGUAGE_ISO,
  TEST_LANGUAGE_NAME,
} from "./setup.js";
import updateLanguageTool from "../put/update-language.js";

const elicitation = createElicitation();

describe("update-language", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let defaultIsoCode: string;

  beforeAll(async () => {
    const state = await initLanguageTestState(extra);
    defaultIsoCode = state.defaultIsoCode;
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

  it("should update a language", async () => {
    // Ensure the test language exists
    await LanguageTestHelper.cleanup(TEST_LANGUAGE_ISO);
    await new LanguageBuilder()
      .withIsoCode(TEST_LANGUAGE_ISO)
      .withName(TEST_LANGUAGE_NAME)
      .create();

    const result = await updateLanguageTool.handler(
      { isoCode: TEST_LANGUAGE_ISO, isMandatory: false, isDefault: undefined, fallbackIsoCode: undefined },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.isoCode).toBe(TEST_LANGUAGE_ISO);
    expect(data.message).toContain("updated");
  }, 30000);

  it("should cancel update when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      updateLanguageTool.handler(
        { isoCode: defaultIsoCode, isMandatory: false, isDefault: undefined, fallbackIsoCode: undefined },
        extra,
      ),
    );
  }, 30000);
});
