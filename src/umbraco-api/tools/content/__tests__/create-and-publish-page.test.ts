/**
 * create-and-publish-page Integration Tests
 *
 * Tests for the create-and-publish-page POST tool in the content collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, jest, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
  ContentTestHelper,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { expectPublished } from "../../../../testing/state-assertions.js";
import { mcpClientManager } from "../../../mcp-client.js";
import createAndPublishPageTool from "../post/create-and-publish-page.js";

const TEST_PAGE_NAME = "_Test Create And Publish Page";
const TEST_PAGE_NAME_FALLBACK = "_Test Create And Publish Page Fallback";
const TEST_PAGE_NAME_FALLBACK_PUBLISH_FAILS = "_Test Create And Publish Page Fallback Publish Fails";
const TEST_VALUES = [{ alias: "title", value: "Created And Published Title" }];

describe("create-and-publish-page", () => {
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

  it("should create and publish a page in one call", async () => {
    const result = await callTool(
      createAndPublishPageTool,
      {
        name: TEST_PAGE_NAME,
        documentTypeId: testDocumentTypeId,
        parentId: testPageId,
        values: TEST_VALUES,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    lastCreatedId = data.id;

    expect(createSnapshotResult(result, data.id)).toMatchSnapshot();

    await expectPublished(data.id, extra);
  }, 30000);

  it("should return an error for an invalid document type", async () => {
    const result = await callTool(
      createAndPublishPageTool,
      {
        name: TEST_PAGE_NAME,
        documentTypeId: NON_EXISTENT_UUID,
        parentId: testPageId,
        values: undefined,
      },
      extra,
    );

    expect(result.isError).toBeTruthy();
  }, 30000);

  it("falls back to create-document + publish-document when create-and-publish-document isn't available", async () => {
    // Only listTools is mocked — create-document and publish-document still
    // run for real against the running Umbraco, exercising the actual
    // fallback sequence end to end. callTool is also spied (pass-through to
    // the real implementation) purely to record which tool names were
    // invoked, so the test can prove the fallback path — not just the atomic
    // one — actually ran.
    const listToolsSpy = jest.spyOn(mcpClientManager, "listTools");
    listToolsSpy.mockImplementationOnce(async () => ({
      tools: [
        { name: "get-document-type-by-id" },
        { name: "get-data-types-by-id-array" },
        { name: "create-document" },
        { name: "publish-document" },
      ],
    }));

    const originalCallTool = mcpClientManager.callTool.bind(mcpClientManager);
    const calledToolNames: string[] = [];
    const callToolSpy = jest.spyOn(mcpClientManager, "callTool");
    callToolSpy.mockImplementation(async (server: string, toolName: string, args: Record<string, unknown>) => {
      calledToolNames.push(toolName);
      return originalCallTool(server, toolName, args);
    });

    try {
      const result = await callTool(
        createAndPublishPageTool,
        {
          name: TEST_PAGE_NAME_FALLBACK,
          documentTypeId: testDocumentTypeId,
          parentId: testPageId,
          values: TEST_VALUES,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();

      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;

      expect(data.message).toBe(`Created and published "${TEST_PAGE_NAME_FALLBACK}"`);

      // Prove the fallback sequence actually ran, not the atomic tool.
      expect(calledToolNames).not.toContain("create-and-publish-document");
      expect(calledToolNames).toContain("create-document");
      expect(calledToolNames).toContain("publish-document");

      await expectPublished(data.id, extra);
    } finally {
      callToolSpy.mockRestore();
      listToolsSpy.mockRestore();
    }
  }, 30000);

  it("reports the draft id with a publish-failed message when publish-document fails after a successful fallback create", async () => {
    const listToolsSpy = jest.spyOn(mcpClientManager, "listTools");
    listToolsSpy.mockImplementationOnce(async () => ({
      tools: [
        { name: "get-document-type-by-id" },
        { name: "get-data-types-by-id-array" },
        { name: "create-document" },
        { name: "publish-document" },
      ],
    }));

    // get-document-type-by-id, get-data-types-by-id-array and create-document
    // run for real; only publish-document is intercepted to simulate a
    // failure after a successful create, so capture the real implementation
    // before spying.
    const originalCallTool = mcpClientManager.callTool.bind(mcpClientManager);
    const callToolSpy = jest.spyOn(mcpClientManager, "callTool");
    callToolSpy.mockImplementation(async (server: string, toolName: string, args: Record<string, unknown>) => {
      if (toolName === "publish-document") {
        const problemDetails = {
          type: "Error",
          title: "Publish failed",
          status: 500,
          detail: "Simulated publish failure",
        };
        return {
          isError: true,
          structuredContent: problemDetails,
          content: [{ type: "text" as const, text: JSON.stringify(problemDetails) }],
        };
      }
      return originalCallTool(server, toolName, args);
    });

    try {
      const result = await callTool(
        createAndPublishPageTool,
        {
          name: TEST_PAGE_NAME_FALLBACK_PUBLISH_FAILS,
          documentTypeId: testDocumentTypeId,
          parentId: testPageId,
          values: TEST_VALUES,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();

      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;

      expect(data.id).toBeTruthy();
      expect(data.message).toContain(`Created "${TEST_PAGE_NAME_FALLBACK_PUBLISH_FAILS}" as a draft but publish failed`);
      expect(data.publishedUrls).toEqual([]);
    } finally {
      callToolSpy.mockRestore();
      listToolsSpy.mockRestore();
    }
  }, 30000);
});
