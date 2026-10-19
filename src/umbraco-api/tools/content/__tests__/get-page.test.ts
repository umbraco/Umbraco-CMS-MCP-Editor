import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
  NON_EXISTENT_UUID,
} from "./setup.js";
import getPageTool from "../get/get-page.js";

const TEST_PAGE_NAME = "_Test Get Page";

describe("get-page", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testDocumentTypeId: string;
  let doc: ContentBuilder;
  let publishedDoc: ContentBuilder;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;

    doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();

    publishedDoc = await new ContentBuilder()
      .withName("_Test Get Page Published")
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    await publishedDoc.publish();
  }, 60000);

  afterAll(async () => {
    if (doc) {
      await ContentTestHelper.cleanupById(doc.getId());
    }
    if (publishedDoc) {
      await ContentTestHelper.cleanupById(publishedDoc.getId());
    }
  }, 30000);

  it("should get page details by ID", async () => {
    const result = await getPageTool.handler({ id: doc.getId() }, extra);

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
  }, 30000);

  it("returns [] publishedUrls for a draft-only page (regression for #233)", async () => {
    const result = await getPageTool.handler({ id: doc.getId() }, extra);
    const data = createSnapshotResult(result, doc.getId()).structuredContent as any;

    expect(data.publishedUrls).toEqual([]);
  }, 30000);

  it("returns a real published URL once the page is live (regression for #233)", async () => {
    const result = await getPageTool.handler({ id: publishedDoc.getId() }, extra);

    expect(createSnapshotResult(result, publishedDoc.getId())).toMatchSnapshot();
  }, 30000);

  it("should return error for non-existent page", async () => {
    const result = await getPageTool.handler({ id: NON_EXISTENT_UUID }, extra);

    expect(result.isError).toBe(true);
  }, 30000);
});
