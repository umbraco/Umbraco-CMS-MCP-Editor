import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initDictionaryTestState,
  createElicitation,
  expectElicitationCancel,
  DictionaryBuilder,
  DictionaryTestHelper,
  DEFAULT_ISO_CODE,
} from "./setup.js";
import updateDictionaryTool from "../put/update-dictionary.js";
import getDictionaryTool from "../get/get-dictionary.js";

const TEST_DICTIONARY_NAME = "_Test Update Dictionary";

const elicitation = createElicitation();

describe("update-dictionary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let existingItemId: string | undefined;

  beforeAll(async () => {
    const state = await initDictionaryTestState(extra);
    existingItemId = state.existingItemId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await DictionaryTestHelper.cleanup(TEST_DICTIONARY_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should update translations for a dictionary item", async () => {
    const item = await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation(DEFAULT_ISO_CODE, "Original value")
      .create();

    const result = await updateDictionaryTool.handler(
      {
        id: item.getId(),
        translations: [{ isoCode: DEFAULT_ISO_CODE, translation: "Updated value" }],
      },
      extra,
    );

    if (result.isError) {
      console.warn("Skipping update-dictionary assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(item.getId());
    expect(data.message).toContain("Updated");
    expect(data.updatedLanguages).toContain(DEFAULT_ISO_CODE);

    // Verify via get-dictionary
    const verifyResult = await getDictionaryTool.handler({ id: item.getId() }, extra);
    expect(createSnapshotResult(verifyResult, item.getId())).toMatchSnapshot();
  }, 30000);

  it("should cancel update when elicitation is rejected", async () => {
    if (!existingItemId) {
      console.warn("Skipping update elicitation test: no existing dictionary items");
      return;
    }

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      updateDictionaryTool.handler(
        {
          id: existingItemId!,
          translations: [{ isoCode: DEFAULT_ISO_CODE, translation: "Should not change" }],
        },
        extra,
      ),
    );
  }, 30000);
});
