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

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
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
import { getOrCreateCompositionDoctypeFixture } from "./helpers/composition-doctype-fixture.js";
import createAndPublishPageTool from "../post/create-and-publish-page.js";
import getPageTool from "../get/get-page.js";

const TEST_PAGE_NAME = "_Test Create And Publish Page";
const TEST_VALUES = [{ alias: "title", value: "Created And Published Title" }];
const TEST_COMPOSITION_PAGE_NAME = "_Test Create And Publish Page Composition Value";

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

  it("resolves editorAlias for a value on a composition-inherited property", async () => {
    const fixture = await getOrCreateCompositionDoctypeFixture();

    const result = await callTool(
      createAndPublishPageTool,
      {
        name: TEST_COMPOSITION_PAGE_NAME,
        documentTypeId: fixture.hostDocumentTypeId,
        parentId: undefined,
        values: [
          { alias: fixture.hostPropertyAlias, value: "Host value" },
          { alias: fixture.compositionPropertyAlias, value: "Composition-inherited value" },
        ],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    lastCreatedId = data.id;

    await expectPublished(data.id, extra);

    const verifyResult = await callTool(getPageTool, { id: data.id }, extra);
    const verifyData = getStructuredContent(verifyResult) as any;
    const compositionValue = verifyData.values?.find((v: any) => v.alias === fixture.compositionPropertyAlias);
    expect(compositionValue?.value).toBe("Composition-inherited value");
  }, 30000);

  it("fails before calling Umbraco when a value's alias isn't a property on the document type", async () => {
    const fixture = await getOrCreateCompositionDoctypeFixture();

    const result = await callTool(
      createAndPublishPageTool,
      {
        name: TEST_COMPOSITION_PAGE_NAME,
        documentTypeId: fixture.hostDocumentTypeId,
        parentId: undefined,
        values: [{ alias: "notARealPropertyAlias", value: "whatever" }],
      },
      extra,
    );

    expect(result.isError).toBeTruthy();
    const text = JSON.stringify(result);
    expect(text).toContain("notARealPropertyAlias");

    // No partial page should have been created or published.
    const found = await ContentTestHelper.findDocument(TEST_COMPOSITION_PAGE_NAME);
    expect(found).toBeUndefined();
  }, 30000);
});
