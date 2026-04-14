/**
 * edit-page Integration Tests
 *
 * Tests for the edit-page PUT tool in the content collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

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
import editPageTool from "../put/edit-page.js";

const TEST_PAGE_NAME = "_Test Edit Page";
const TEST_EDIT_VALUES = [{ alias: "title", value: "Updated Title" }];
const TEST_ELICITATION_VALUES = [{ alias: "title", value: "Should Not Change" }];

const elicitation = createElicitation();

describe("edit-page", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testDocumentTypeId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await ContentTestHelper.cleanup(TEST_PAGE_NAME, testPageId);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should edit a page", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();

    const result = await editPageTool.handler(
      { id: doc.getId(), values: TEST_EDIT_VALUES },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
  }, 30000);

  it("should cancel edit when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      editPageTool.handler(
        { id: testPageId, values: TEST_ELICITATION_VALUES },
        extra,
      ),
    );
  }, 30000);
});
