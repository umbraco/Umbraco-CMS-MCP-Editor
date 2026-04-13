import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import listRedirectsTool from "../get/list-redirects.js";

describe("list-redirects", () => {
  setupTestEnvironment();

  it("should list redirects and return structured result (may be empty)", async () => {
    const extra = createMockRequestHandlerExtra();
    const result = await listRedirectsTool.handler({ filter: undefined }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("originalUrl");
      expect(data.items[0]).toHaveProperty("destinationUrl");
      expect(data.items[0]).toHaveProperty("destinationType");
      expect(data.items[0]).toHaveProperty("isAutomatic");
      expect(data.items[0].isAutomatic).toEqual(expect.any(Boolean));
    }
  }, 30000);
});
