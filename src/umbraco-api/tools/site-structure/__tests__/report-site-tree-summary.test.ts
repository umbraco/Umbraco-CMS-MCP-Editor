import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import reportSiteTreeSummaryTool from "../get/report-site-tree-summary.js";

const TEST_PAGE_NAME = "_Test Site Tree Summary";

describe("report-site-tree-summary", () => {
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

  it("should return tree structure with pages", async () => {
    const result = await reportSiteTreeSummaryTool.handler(
      { parentId: undefined, maxDepth: 3 },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.tree)).toBe(true);
    expect(data.totalPages).toBeGreaterThan(0);
    expect(typeof data.pagesPerLevel).toBe("object");
    expect(typeof data.maxDepthFound).toBe("number");

    if (data.tree.length > 0) {
      expect(data.tree[0]).toHaveProperty("id");
      expect(data.tree[0]).toHaveProperty("name");
      expect(data.tree[0]).toHaveProperty("depth");
      expect(data.tree[0]).toHaveProperty("childCount");
    }
  }, 30000);
});
