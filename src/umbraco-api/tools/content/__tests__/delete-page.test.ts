import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
  createElicitation,
  expectElicitationCancel,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import deletePageTool from "../delete/delete-page.js";
import { expectInRecycleBin } from "../../../../testing/state-assertions.js";

const TEST_PAGE_NAME = "_Test Delete Page";

const elicitation = createElicitation();

describe("delete-page", () => {
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

  it("should delete a page (move to recycle bin)", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    const result = await deletePageTool.handler({ id: doc.getId() }, extra);

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
    await expectInRecycleBin(doc.getId(), "content", extra);
  }, 30000);

  it("should find deleted page in recycle bin", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    await doc.moveToRecycleBin();

    const trashed = await ContentTestHelper.findDocumentInRecycleBin(TEST_PAGE_NAME);
    expect(trashed).toBeDefined();
    expect(trashed!.id).toBeDefined();
  }, 30000);

  it("should cancel delete when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() => deletePageTool.handler({ id: testPageId }, extra));
  }, 30000);
});
