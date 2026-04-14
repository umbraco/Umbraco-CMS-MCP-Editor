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

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;

    doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
  }, 60000);

  afterAll(async () => {
    if (doc) {
      await ContentTestHelper.cleanupById(doc.getId());
    }
  }, 30000);

  it("should get page details by ID", async () => {
    const result = await getPageTool.handler({ id: doc.getId() }, extra);

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
  }, 30000);

  it("should return error for non-existent page", async () => {
    const result = await getPageTool.handler({ id: NON_EXISTENT_UUID }, extra);

    expect(result.isError).toBe(true);
  }, 30000);
});
