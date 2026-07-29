/**
 * inspect-element-blocks Integration Tests
 *
 * Tests for the inspect-element-blocks GET tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createSnapshotResult,
  createElementBlockFixture,
  SEEDED_CONTENT_VALUE,
  type ElementBlockFixture,
} from "./setup.js";
import inspectElementBlocksTool from "../get/inspect-element-blocks.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const TEST_ELEMENT_NAME = "_Test Inspect Element Blocks";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

describe("inspect-element-blocks", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: ElementBlockFixture;

  beforeAll(async () => {
    fixture = await createElementBlockFixture(TEST_ELEMENT_NAME);
  }, 120000);

  afterAll(async () => {
    await fixture?.cleanup();
  }, 60000);

  it("should report the seeded block with its key, element type, and properties", async () => {
    const result = await callTool(inspectElementBlocksTool, { id: fixture.elementId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    expect(data.name).toBe(TEST_ELEMENT_NAME);
    expect(data.blockProperties).toHaveLength(1);

    const [property] = data.blockProperties;
    expect(property.propertyAlias).toBe(fixture.propertyAlias);
    expect(property.editorAlias).toBe("Umbraco.BlockList");
    expect(property.blocks).toHaveLength(1);

    const [block] = property.blocks;
    expect(block.contentKey).toBe(fixture.seededBlockKey);
    expect(block.contentTypeKey).toBe(fixture.blockElementTypeId);
    // The seeded block has settings, so the paired key must be surfaced.
    expect(block.settingsKey).toBe(fixture.seededSettingsKey);
    expect(block.properties).toEqual(
      expect.arrayContaining([
        { alias: fixture.blockPropertyAlias, value: SEEDED_CONTENT_VALUE },
      ]),
    );
  }, 60000);

  it("should return no preview URL field (elements are not routable)", async () => {
    const result = await callTool(inspectElementBlocksTool, { id: fixture.elementId }, extra);
    const data = getStructuredContent(result) as any;

    expect(data).not.toHaveProperty("previewUrl");
  }, 60000);

  it("should narrow the walk to a single property when propertyAlias is passed", async () => {
    const matching = await callTool(
      inspectElementBlocksTool,
      { id: fixture.elementId, propertyAlias: fixture.propertyAlias },
      extra,
    );
    expect((getStructuredContent(matching) as any).blockProperties).toHaveLength(1);

    const nonMatching = await callTool(
      inspectElementBlocksTool,
      { id: fixture.elementId, propertyAlias: "noSuchProperty" },
      extra,
    );
    expect((getStructuredContent(nonMatching) as any).blockProperties).toEqual([]);
  }, 60000);

  it("should match the snapshot for the fixture element", async () => {
    const result = await callTool(inspectElementBlocksTool, { id: fixture.elementId }, extra);

    expect(createSnapshotResult(result, fixture.elementId)).toMatchSnapshot();
  }, 60000);

  it("should return error for a non-existent element", async () => {
    const result = await callTool(inspectElementBlocksTool, { id: NON_EXISTENT_UUID }, extra);

    expect(result.isError).toBe(true);
  }, 60000);
});
