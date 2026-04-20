import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
  createElicitation,
  expectElicitationCancel,
  ContentTestHelper,
  NON_EXISTENT_UUID,
} from "./setup.js";
import createPageTool from "../post/create-page.js";
import getPageTool from "../get/get-page.js";

const TEST_PAGE_NAME = "_Test Create Page";

const elicitation = createElicitation();

describe("create-page", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testDocumentTypeId: string;
  let lastCreatedId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    if (lastCreatedId) {
      await ContentTestHelper.cleanupById(lastCreatedId);
      lastCreatedId = undefined;
    }
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should create a draft page", async () => {
    const result = await createPageTool.handler(
      {
        name: TEST_PAGE_NAME,
        documentTypeId: testDocumentTypeId,
        parentId: testPageId,
        values: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    lastCreatedId = data.id;
    const verifyResult = await getPageTool.handler({ id: data.id }, extra);

    expect(createSnapshotResult(verifyResult, data.id)).toMatchSnapshot();
  }, 30000);

  it("should cancel create when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      createPageTool.handler(
        {
          name: "Should Not Be Created",
          documentTypeId: testDocumentTypeId || NON_EXISTENT_UUID,
          parentId: testPageId,
          values: undefined,
        },
        extra,
      ),
    );
  }, 30000);
});
