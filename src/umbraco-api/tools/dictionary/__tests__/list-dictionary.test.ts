import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  DictionaryBuilder,
  DictionaryTestHelper,
} from "./setup.js";
import listDictionaryTool from "../get/list-dictionary.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const TEST_DICTIONARY_NAME = "_Test List Dictionary";

describe("list-dictionary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;

  beforeAll(async () => {
    // Create a dictionary item so the list has known data
    await DictionaryTestHelper.cleanup(TEST_DICTIONARY_NAME);
    const item = await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation("en-US", "List test value")
      .create();
    createdId = item.getId();
  }, 60000);

  afterAll(async () => {
    await DictionaryTestHelper.cleanup(TEST_DICTIONARY_NAME);
  }, 30000);

  it("should list dictionary entries including the created item", async () => {
    const result = await callTool(listDictionaryTool,
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total).toBeGreaterThan(0);

    // Verify our created item appears
    const found = data.items.find((item: any) => item.name === TEST_DICTIONARY_NAME);
    expect(found).toBeDefined();
    expect(found.id).toBeDefined();
    expect(Array.isArray(found.translatedLanguages)).toBe(true);
  }, 30000);

  it("populates translatedLanguages from actual translations", async () => {
    // The dictionary tree endpoints don't include translation data, so
    // list-dictionary fans out to get-dictionary per item to recover
    // the real iso codes.
    const result = await callTool(listDictionaryTool,
      { parentId: undefined },
      extra,
    );
    const data = getStructuredContent(result) as any;
    const ours = data.items.find((item: any) => item.name === TEST_DICTIONARY_NAME);
    expect(ours).toBeDefined();
    expect(ours.translatedLanguages).toContain("en-US");
  }, 30000);
});
