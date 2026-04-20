import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initLanguageTestState,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import listLanguagesTool from "../get/list-languages.js";

describe("list-languages", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initLanguageTestState(extra);
  }, 60000);

  it("should list all configured languages", async () => {
    const result = await listLanguagesTool.handler({}, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.total).toEqual(expect.any(Number));

    // Verify item shape
    const item = data.items[0];
    expect(item).toHaveProperty("isoCode");
    expect(item).toHaveProperty("name");
    expect(item).toHaveProperty("isDefault");
    expect(item).toHaveProperty("isMandatory");
  }, 30000);
});
