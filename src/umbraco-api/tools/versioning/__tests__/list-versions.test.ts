import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initVersioningTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import listVersionsTool from "../get/list-versions.js";

describe("list-versions", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initVersioningTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should list version history for a page", async () => {
    const result = await listVersionsTool.handler({ id: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.name).toEqual(expect.any(String));
    expect(data.versions).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.versions.length > 0) {
      const version = data.versions[0];
      expect(version).toHaveProperty("versionId");
      expect(version).toHaveProperty("date");
    }
  }, 30000);

  it("should handle pagination", async () => {
    const result = await listVersionsTool.handler({ id: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.versions.length).toBeGreaterThan(0);
  }, 30000);

  it("should return error for non-existent page", async () => {
    const result = await listVersionsTool.handler({ id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);
});
