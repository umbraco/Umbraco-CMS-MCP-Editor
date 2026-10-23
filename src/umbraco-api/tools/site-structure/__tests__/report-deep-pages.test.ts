import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import reportDeepPagesTool from "../get/report-deep-pages.js";

const TEST_PAGE_NAME = "_Test Report Deep";

describe("report-deep-pages", () => {
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
      .withName("_Test Report Deep Published")
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

  it("should return deep pages report with scanned pages", async () => {
    const result = await reportDeepPagesTool.handler(
      { depthThreshold: 4, parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.scannedPages).toBeGreaterThan(0);
    expect(typeof data.threshold).toBe("number");
    expect(typeof data.total).toBe("number");
  }, 60000);

  it("reports '' for a draft-only page and a real URL for a published page (regression for #233)", async () => {
    // depthThreshold 0 and scoping to testPageId guarantees both fixtures
    // (direct children, depth 1) are included in `items`.
    const result = await reportDeepPagesTool.handler(
      { depthThreshold: 0, parentId: testPageId },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    const draftItem = data.items.find((i: any) => i.id === createdId);
    const publishedItem = data.items.find((i: any) => i.id === publishedId);

    expect(draftItem?.url).toBe("");
    expect(typeof publishedItem?.url).toBe("string");
    expect(publishedItem?.url.length).toBeGreaterThan(0);
  }, 60000);
});
