import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initDictionaryTestState,
  createElicitation,
  expectElicitationCancel,
  DictionaryBuilder,
  DictionaryTestHelper,
  DEFAULT_ISO_CODE,
} from "./setup.js";
import moveDictionaryTool from "../put/move-dictionary.js";

const TEST_DICTIONARY_NAME = "_Test Move Dictionary";

const elicitation = createElicitation();

describe("move-dictionary", () => {
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

  it("should move a dictionary item to root", async () => {
    const item = await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation(DEFAULT_ISO_CODE, "Move test value")
      .create();

    const result = await moveDictionaryTool.handler(
      { id: item.getId(), targetParentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(item.getId());
    expect(data.message).toContain("Moved");
  }, 30000);

  it("should cancel move when elicitation is rejected", async () => {

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      moveDictionaryTool.handler(
        { id: existingItemId!, targetParentId: undefined },
        extra,
      ),
    );
  }, 30000);
});
