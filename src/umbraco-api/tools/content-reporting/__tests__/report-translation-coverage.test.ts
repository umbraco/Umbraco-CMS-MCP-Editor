import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import reportTranslationCoverageTool from "../get/report-translation-coverage.js";

describe("report-translation-coverage", () => {
  setupTestEnvironment();

  it("should return translation coverage matrix", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportTranslationCoverageTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.languages).toBeInstanceOf(Array);
    expect(data.languages.length).toBeGreaterThan(0);
    expect(data.items).toBeInstanceOf(Array);
    expect(data.summary).toBeDefined();
    expect(data.scannedPages).toEqual(expect.any(Number));

    // Verify language shape
    expect(data.languages[0]).toHaveProperty("isoCode");
    expect(data.languages[0]).toHaveProperty("name");

    // Verify item shape if any exist
    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("cultures");
    }
  }, 120000);
});
