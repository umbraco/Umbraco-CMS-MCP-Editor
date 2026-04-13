import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initDictionaryTestState,
  DictionaryBuilder,
  DictionaryTestHelper,
  NON_EXISTENT_UUID,
  DEFAULT_ISO_CODE,
} from "./setup.js";
import getDictionaryTool from "../get/get-dictionary.js";

const TEST_DICTIONARY_NAME = "_Test Get Dictionary";

describe("get-dictionary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initDictionaryTestState(extra);
  }, 60000);

  afterEach(async () => {
    await DictionaryTestHelper.cleanup(TEST_DICTIONARY_NAME);
  }, 30000);

  it("should get a dictionary item with all translations", async () => {
    const item = await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation(DEFAULT_ISO_CODE, "Test translation value")
      .create();

    const result = await getDictionaryTool.handler({ id: item.getId() }, extra);

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, item.getId())).toMatchSnapshot();
  }, 30000);

  it("should return error for non-existent dictionary item", async () => {
    const result = await getDictionaryTool.handler(
      { id: NON_EXISTENT_UUID },
      extra,
    );

    expect(result.isError).toBeTruthy();
  }, 30000);
});
