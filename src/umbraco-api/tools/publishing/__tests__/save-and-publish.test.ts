/**
 * save-and-publish Integration Tests
 *
 * Tests for the save-and-publish POST tool in the publishing collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { withHumanInTheLoopBlocking } from "../../../../testing/human-in-the-loop-test-helper.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import {
  ContentBuilder,
  ContentTestHelper,
  initContentTestState,
} from "../../content/__tests__/setup.js";
import saveAndPublishTool from "../post/save-and-publish.js";
import editPageTool from "../../content/put/edit-page.js";
import { expectPublished } from "../../../../testing/state-assertions.js";

const TEST_PAGE_NAME_WITH_VALUES = "_Test Save Publish With Values";
const TEST_PAGE_NAME_NO_VALUES = "_Test Save Publish No Values";

describe("save-and-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testParentId: string;
  let testDocumentTypeId: string;
  let lastCreatedId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testParentId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  afterEach(async () => {
    if (lastCreatedId) {
      await ContentTestHelper.cleanupById(lastCreatedId);
      lastCreatedId = undefined;
    }
  }, 30000);

  it("saves values and publishes in one call", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_WITH_VALUES)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    lastCreatedId = doc.getId();

    const result = await saveAndPublishTool.handler(
      {
        id: doc.getId(),
        values: [{ alias: "title", value: "Save And Publish Title" }],
        includeDescendants: false,
      },
      extra,
    );

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
    await expectPublished(doc.getId(), extra);
  }, 60000);

  it("publishes without values when none provided", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_NO_VALUES)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    lastCreatedId = doc.getId();

    await editPageTool.handler(
      { id: doc.getId(), values: [{ alias: "title", value: "Pre-edited Title" }] },
      extra,
    );

    const result = await saveAndPublishTool.handler(
      { id: doc.getId(), values: undefined, includeDescendants: false },
      extra,
    );

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
    await expectPublished(doc.getId(), extra);
  }, 60000);

  it("blocks save-and-publish when the human-in-the-loop gate is enabled, before touching the CMS", async () => {
    await withHumanInTheLoopBlocking(async () => {
      const result = await callTool(
        saveAndPublishTool,
        { id: NON_EXISTENT_UUID, values: undefined, includeDescendants: false },
        extra,
      );
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual(
        expect.objectContaining({ status: 403, title: expect.stringContaining("blocked") }),
      );
    });
  }, 30000);
});
