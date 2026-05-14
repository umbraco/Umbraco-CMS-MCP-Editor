/**
 * rename-page Integration Tests
 *
 * Tests for the rename-page PUT tool in the content collection.
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
  extractChainedResult,
  ContentBuilder,
  ContentTestHelper,
  NON_EXISTENT_UUID,
} from "./setup.js";
import renamePageTool from "../put/rename-page.js";
import { mcpClientManager } from "../../../mcp-client.js";

const TEST_PAGE_NAME = "_Test Rename Page";
const TEST_RENAMED = "_Test Renamed Page";

const elicitation = createElicitation();

describe("rename-page", () => {
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

  it("should rename a page and update the variant name", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    const result = await renamePageTool.handler(
      { id: doc.getId(), name: TEST_RENAMED, culture: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(doc.getId());
    expect(data.previousName).toBe(TEST_PAGE_NAME);
    expect(data.name).toBe(TEST_RENAMED);
    expect(data.message).toContain(TEST_RENAMED);

    // Verify the rename actually persisted
    const verify = await mcpClientManager.callTool("cms", "get-document-by-id", { id: doc.getId() });
    const verified = extractChainedResult(verify) as any;
    expect(verified.variants?.[0]?.name).toBe(TEST_RENAMED);
  }, 60000);

  it("should return no-change message when new name matches current name", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    const result = await renamePageTool.handler(
      { id: doc.getId(), name: TEST_PAGE_NAME, culture: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("already named");
    expect(data.name).toBe(TEST_PAGE_NAME);
    // No elicitation should have been triggered for a no-op
    expect(elicitation.mock).not.toHaveBeenCalled();
  }, 30000);

  it("should cancel rename when elicitation is rejected", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      renamePageTool.handler({ id: doc.getId(), name: TEST_RENAMED, culture: undefined }, extra),
    );

    // Verify the name was NOT changed
    const verify = await mcpClientManager.callTool("cms", "get-document-by-id", { id: doc.getId() });
    const verified = extractChainedResult(verify) as any;
    expect(verified.variants?.[0]?.name).toBe(TEST_PAGE_NAME);
  }, 60000);

  it("should error for a non-existent page", async () => {
    const result = await renamePageTool.handler(
      { id: NON_EXISTENT_UUID, name: TEST_RENAMED, culture: undefined },
      extra,
    );
    expect(result.isError).toBeTruthy();
  }, 30000);

  it("should error when culture does not match any variant", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    lastCreatedId = doc.getId();

    const result = await renamePageTool.handler(
      { id: doc.getId(), name: TEST_RENAMED, culture: "zz-ZZ" },
      extra,
    );
    expect(result.isError).toBeTruthy();
  }, 30000);
});
