import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import searchMembersTool from "../get/search-members.js";

describe("search-members", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should search members and return results with expected shape", async () => {
    const result = await searchMembersTool.handler({ query: "admin" }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      const item = data.items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("email");
      expect(item).toHaveProperty("memberType");
      expect(item).toHaveProperty("isApproved");
      expect(item).toHaveProperty("isLockedOut");
    }
  }, 30000);

  it("should return empty results for nonsense query", async () => {
    const result = await searchMembersTool.handler({ query: "xyznonexistent99999zzz" }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toBe(0);
  }, 30000);
});
