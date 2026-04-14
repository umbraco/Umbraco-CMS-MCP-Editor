import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import reportShortContentTool from "../get/report-short-content.js";

const TEST_PAGE_NAME = "_Test Report Short";

describe("report-short-content", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    // Create a page with no body content — it will have 0 words (short)
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    createdId = doc.getId();
  }, 60000);

  afterAll(async () => {
    if (createdId) await ContentTestHelper.cleanupById(createdId);
  }, 30000);

  it("should find pages below word count threshold", async () => {
    const result = await reportShortContentTool.handler(
      { minWordCount: 100, parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.scannedPages).toBeGreaterThan(0);
    expect(typeof data.threshold).toBe("number");
    expect(data.total).toBeGreaterThan(0);

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("name");
      expect(data.items[0]).toHaveProperty("wordCount");
    }
  }, 30000);
});
