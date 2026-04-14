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

  it("should get redirect details when one exists", async () => {

    const result = await getRedirectTool.handler({ id: firstRedirectId! }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(firstRedirectId);
    expect(data.originalUrl).toEqual(expect.any(String));
    expect(data.destinationUrl).toEqual(expect.any(String));
    expect(data.destinationType).toEqual(expect.any(String));
    expect(data.isAutomatic).toEqual(expect.any(Boolean));
    expect(data.createDate).toEqual(expect.any(String));
  }, 30000);

  it("should return error or empty result for non-existent redirect", async () => {
    const result = await getRedirectTool.handler({ id: NON_EXISTENT_UUID }, extra);

    if (result.isError) {
      expect(result.isError).toBeTruthy();
    } else {
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
    }
  }, 30000);
});
