import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initSchedulingTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import getPublishStatusTool from "../get/get-publish-status.js";

describe("get-publish-status", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initSchedulingTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should return publish status for a known page", async () => {
    const result = await getPublishStatusTool.handler({ id: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(data.name).toEqual(expect.any(String));
    expect(data.isPublished).toEqual(expect.any(Boolean));
    expect(data.state).toEqual(expect.any(String));
    expect(data.variants).toBeInstanceOf(Array);
  }, 30000);

  it("should return error for non-existent page", async () => {
    const result = await getPublishStatusTool.handler({ id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);
});
