import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initLanguageTestState,
  createElicitation,
  expectElicitationCancel,
  LanguageBuilder,
  TEST_LANGUAGE_ISO,
  TEST_LANGUAGE_NAME,
} from "./setup.js";
import deleteLanguageTool from "../delete/delete-language.js";
import getLanguageTool from "../get/get-language.js";

const elicitation = createElicitation();

describe("delete-language", () => {
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

  beforeEach(() => {
    elicitation.reset();
  });

  it("should delete a language", async () => {
    // Create the test language first
    try {
      await new LanguageBuilder()
        .withIsoCode(TEST_LANGUAGE_ISO)
        .withName(TEST_LANGUAGE_NAME)
        .create();
    } catch {
      // May already exist — try to delete it anyway
    }

    const result = await deleteLanguageTool.handler({ isoCode: TEST_LANGUAGE_ISO }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.isoCode).toBe(TEST_LANGUAGE_ISO);
    expect(data.message).toContain("deleted");

    // Verify it's actually gone
    const getResult = await getLanguageTool.handler({ isoCode: TEST_LANGUAGE_ISO }, extra);
    expect(getResult.isError).toBe(true);
  }, 30000);

  it("should cancel delete when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      deleteLanguageTool.handler({ isoCode: defaultIsoCode }, extra),
    );
  }, 30000);
});
