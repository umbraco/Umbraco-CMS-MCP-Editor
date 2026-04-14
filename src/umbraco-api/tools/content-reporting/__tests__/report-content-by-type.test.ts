import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import reportContentByTypeTool from "../get/report-content-by-type.js";

const TEST_PAGE_NAME = "_Test Report By Type";

describe("report-content-by-type", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
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

  it("should return content breakdown by document type", async () => {
    const result = await reportContentByTypeTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.totalPages).toBeGreaterThan(0);
    expect(data.totalTypes).toBeGreaterThan(0);

    // Verify at least one type group exists with expected shape
    expect(data.items[0]).toHaveProperty("documentType");
    expect(data.items[0]).toHaveProperty("count");
    expect(data.items[0]).toHaveProperty("pages");
  }, 30000);
});
