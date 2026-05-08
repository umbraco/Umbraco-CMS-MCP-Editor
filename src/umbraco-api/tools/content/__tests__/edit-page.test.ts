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

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import editPageTool from "../put/edit-page.js";

const TEST_PAGE_NAME = "_Test Edit Page";
const TEST_EDIT_VALUES = [{ alias: "title", value: "Updated Title" }];

describe("edit-page", () => {
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

  afterEach(async () => {
    if (lastCreatedId) {
      await ContentTestHelper.cleanupById(lastCreatedId);
      lastCreatedId = undefined;
    }
  }, 30000);

  it("should edit a page", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    const result = await editPageTool.handler(
      { id: doc.getId(), values: TEST_EDIT_VALUES },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
  }, 30000);
});
