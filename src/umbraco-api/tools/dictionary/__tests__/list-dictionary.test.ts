import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initDictionaryTestState,
} from "./setup.js";
import listDictionaryTool from "../get/list-dictionary.js";

describe("list-dictionary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initDictionaryTestState(extra);
  }, 60000);

  it("should list root dictionary entries", async () => {
    const result = await listDictionaryTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
