import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initMediaTestState,
} from "./setup.js";

import getMediaTool from "../get/get-media.js";

describe("get-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testMediaId: string;

  beforeAll(async () => {
    const state = await initMediaTestState(extra);
    testMediaId = state.testMediaId;
  }, 60000);

  it("should get media item details by ID", async () => {
    const result = await getMediaTool.handler(
      { id: testMediaId },
      extra,
    );

    expect(createSnapshotResult(result, testMediaId)).toMatchSnapshot();
  }, 30000);

  it("should return error for non-existent media item", async () => {
    const result = await getMediaTool.handler(
      { id: "00000000-0000-0000-0000-000000000000" },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 30000);
});
