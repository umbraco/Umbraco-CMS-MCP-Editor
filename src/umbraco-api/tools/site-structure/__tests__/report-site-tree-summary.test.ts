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
  let publishedId: string | undefined;
  let testPageId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;

    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    createdId = doc.getId();

    const publishedDoc = await new ContentBuilder()
      .withName("_Test Site Tree Summary Published")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    await publishedDoc.publish();
    publishedId = publishedDoc.getId();
  }, 60000);

  afterAll(async () => {
    if (createdId) await ContentTestHelper.cleanupById(createdId);
    if (publishedId) await ContentTestHelper.cleanupById(publishedId);
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

  it("reports '' for a draft-only page and a real URL for a published page (regression for #233)", async () => {
    const result = await reportSiteTreeSummaryTool.handler(
      { parentId: testPageId, maxDepth: 1 },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    const findNode = (nodes: any[], id: string): any => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = findNode(node.children ?? [], id);
        if (found) return found;
      }
      return undefined;
    };

    const draftNode = findNode(data.tree, createdId!);
    const publishedNode = findNode(data.tree, publishedId!);

    expect(draftNode?.url).toBe("");
    expect(typeof publishedNode?.url).toBe("string");
    expect(publishedNode?.url.length).toBeGreaterThan(0);
  }, 30000);
});
