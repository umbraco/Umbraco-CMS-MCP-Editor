import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import reportStaleContentTool from "../get/report-stale-content.js";

const TEST_PAGE_NAME = "_Test Report Stale";

describe("report-stale-content", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    // Create a page so the scanner has content to scan
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

  it("should return stale content report with scanned pages", async () => {
    // Use threshold of 0 days so even fresh pages appear as "stale"
    const result = await reportStaleContentTool.handler(
      { daysSinceUpdate: 0, parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.scannedPages).toBeGreaterThan(0);
    expect(typeof data.threshold).toBe("number");
    expect(data.total).toBeGreaterThan(0);

    // Verify item shape
    expect(data.items[0]).toHaveProperty("id");
    expect(data.items[0]).toHaveProperty("name");
    expect(data.items[0]).toHaveProperty("daysSinceUpdate");
  }, 30000);
});
