import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
} from "./setup.js";
import inspectBlocksTool from "../get/inspect-blocks.js";

describe("inspect-blocks", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should return block structure for a page", async () => {
    const result = await inspectBlocksTool.handler(
      { id: testPageId, propertyAlias: undefined },
      extra
    );

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);
});
