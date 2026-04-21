import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initDictionaryTestState,
  DictionaryTestHelper,
  DEFAULT_ISO_CODE,
} from "./setup.js";
import createDictionaryTool from "../post/create-dictionary.js";
import getDictionaryTool from "../get/get-dictionary.js";

const TEST_DICTIONARY_NAME = "_Test Create Dictionary";

describe("create-dictionary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initDictionaryTestState(extra);
  }, 60000);

  afterEach(async () => {
    await DictionaryTestHelper.cleanup(TEST_DICTIONARY_NAME);
  }, 30000);

  it("should create a dictionary item", async () => {
    const result = await createDictionaryTool.handler(
      {
        name: TEST_DICTIONARY_NAME,
        translations: [{ isoCode: DEFAULT_ISO_CODE, translation: "Integration test value" }],
        parentId: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    expect(data.name).toBe(TEST_DICTIONARY_NAME);

    // Verify via get-dictionary if we got an ID
    if (data.id) {
      const verifyResult = await getDictionaryTool.handler({ id: data.id }, extra);
      expect(createSnapshotResult(verifyResult, data.id)).toMatchSnapshot();
    }
  }, 30000);
});
