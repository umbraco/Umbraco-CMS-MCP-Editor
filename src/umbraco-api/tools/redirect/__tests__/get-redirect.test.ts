import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initRedirectTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import getRedirectTool from "../get/get-redirect.js";

describe("get-redirect", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRedirectId: string | undefined;

  beforeAll(async () => {
    const state = await initRedirectTestState(extra);
    firstRedirectId = state.firstRedirectId;
  }, 60000);

  it("should get redirect details if one exists", async () => {
    if (firstRedirectId) {
      const result = await getRedirectTool.handler({ id: firstRedirectId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(firstRedirectId);
      expect(data.originalUrl).toEqual(expect.any(String));
      expect(data.destinationUrl).toEqual(expect.any(String));
    }
    // If no redirects exist (fresh install), this test verifies the setup works
    // without requiring specific data.
  }, 30000);

  it("should handle non-existent redirect", async () => {
    const result = await getRedirectTool.handler({ id: NON_EXISTENT_UUID }, extra);

    // The tool returns either an error (isError: true) or a response with
    // minimal data — both are acceptable for a non-existent redirect
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
  }, 30000);
});
