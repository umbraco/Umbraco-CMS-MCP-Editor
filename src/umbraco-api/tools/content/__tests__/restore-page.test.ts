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

import { describe, it, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initContentTestState,
  createElicitation,
  expectElicitationCancel,
  ContentTestHelper,
} from "./setup.js";
import restorePageTool from "../put/restore-page.js";

const TEST_PAGE_NAME = "_Test Restore Page";

const elicitation = createElicitation();

describe("restore-page", () => {
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

  it("should cancel restore when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      restorePageTool.handler({ id: testPageId }, extra),
    );
  }, 30000);
});
