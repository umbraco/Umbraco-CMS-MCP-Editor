import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import getRedirectStatusTool from "../get/get-redirect-status.js";

describe("get-redirect-status", () => {
  setupTestEnvironment();

  it("should return whether redirect tracking is enabled", async () => {
    const extra = createMockRequestHandlerExtra();
    const result = await getRedirectStatusTool.handler({}, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.isEnabled).toEqual(expect.any(Boolean));
    expect(data.message).toEqual(expect.any(String));
  }, 30000);
});
