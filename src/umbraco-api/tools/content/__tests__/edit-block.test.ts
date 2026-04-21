/**
 * edit-block Integration Tests
 *
 * Tests for the edit-block PUT tool in the content collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
} from "./setup.js";
import editBlockTool from "../put/edit-block.js";
import inspectBlocksTool from "../get/inspect-blocks.js";

describe("edit-block", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should edit a block property when blocks exist", async () => {
    const inspectResult = await inspectBlocksTool.handler(
      { id: testPageId, propertyAlias: undefined },
      extra,
    );

    const inspectData = getStructuredContent(inspectResult) as any;
    expect(inspectData?.blockProperties).toBeDefined();

    const blockProp = inspectData.blockProperties.find(
      (bp: any) => bp.blocks?.length > 0,
    );
    if (!blockProp) {
      // Graceful skip — no block properties with blocks on this test page
      return;
    }

    const block = blockProp.blocks.find(
      (b: any) => b.contentKey && b.values?.length > 0,
    );
    if (!block) {
      // Graceful skip — no blocks with values on this test page
      return;
    }

    const firstValue = block.values[0];
    const result = await editBlockTool.handler(
      {
        id: testPageId,
        propertyAlias: blockProp.propertyAlias,
        contentKey: block.contentKey,
        values: [{ alias: firstValue.alias, value: firstValue.value }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);
});
