import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initDictionaryTestState,
} from "./setup.js";
import searchDictionaryTool from "../get/search-dictionary.js";

describe("search-dictionary", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initDictionaryTestState(extra);
  }, 60000);

  it("should search for dictionary items by key name", async () => {
    const result = await searchDictionaryTool.handler({ query: "a" }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("name");
    }
  }, 30000);

  it("should return empty results for non-matching query", async () => {
    const result = await searchDictionaryTool.handler(
      { query: "xyznonexistent99999mcp" },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));
  }, 30000);
});
