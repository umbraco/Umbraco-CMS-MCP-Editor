import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initDictionaryTestState,
  DictionaryBuilder,
  DictionaryTestHelper,
  DEFAULT_ISO_CODE,
} from "./setup.js";
import updateDictionaryTool from "../put/update-dictionary.js";
import getDictionaryTool from "../get/get-dictionary.js";

const TEST_DICTIONARY_NAME = "_Test Update Dictionary";

describe("update-dictionary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initDictionaryTestState(extra);
  }, 60000);

  afterEach(async () => {
    await DictionaryTestHelper.cleanup(TEST_DICTIONARY_NAME);
  }, 30000);

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

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(item.getId());
    expect(data.message).toContain("Updated");
    expect(data.updatedLanguages).toContain(DEFAULT_ISO_CODE);

    // Verify via get-dictionary
    const verifyResult = await getDictionaryTool.handler({ id: item.getId() }, extra);
    expect(createSnapshotResult(verifyResult, item.getId())).toMatchSnapshot();
  }, 30000);
});
