/**
 * restore-page Integration Tests
 *
 * Tests for the restore-page PUT tool in the content collection.
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
  getStructuredContent,
  initContentTestState,
  createElicitation,
  expectElicitationCancel,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import deletePageTool from "../delete/delete-page.js";
import restorePageTool from "../put/restore-page.js";

const TEST_PAGE_NAME = "_Test Restore Page";

const elicitation = createElicitation();

describe("restore-page", () => {
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

  it("should restore a deleted page from the recycle bin", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    // Delete via editor tool (consumes an elicitation confirmation)
    await deletePageTool.handler({ id: doc.getId() }, extra);
    elicitation.reset();

    // Restore — pass parentId because the Umbraco API requires explicit target for documents
    const result = await restorePageTool.handler({ id: doc.getId(), parentId: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Restored");
    expect(data.id).toBe(doc.getId());
  }, 60000);

  it("should cancel restore when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      restorePageTool.handler({ id: testPageId, parentId: undefined }, extra),
    );
  }, 30000);
});
