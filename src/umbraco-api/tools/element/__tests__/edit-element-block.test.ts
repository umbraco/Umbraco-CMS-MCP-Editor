/**
 * edit-element-block Integration Tests
 *
 * Tests for the edit-element-block PUT tool in the element collection.
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
  extractChainedResult,
  type ElementBlockFixture,
} from "./setup.js";
import editElementBlockTool from "../put/edit-element-block.js";
import inspectElementBlocksTool from "../get/inspect-element-blocks.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const TEST_ELEMENT_NAME = "_Test Edit Element Block";
const EDITED_CONTENT_VALUE = "Edited element block value";
const EDITED_SETTINGS_VALUE = "Edited element block settings";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

/** Read a single block property value back off the element via inspect-element-blocks. */
async function readBlockValue(
  fixture: ElementBlockFixture,
  extra: ReturnType<typeof createMockRequestHandlerExtra>,
): Promise<unknown> {
  const inspect = await callTool(inspectElementBlocksTool, { id: fixture.elementId }, extra);
  const data = getStructuredContent(inspect) as any;
  const block = data.blockProperties
    ?.find((p: any) => p.propertyAlias === fixture.propertyAlias)
    ?.blocks?.find((b: any) => b.contentKey === fixture.seededBlockKey);
  return block?.properties?.find((p: any) => p.alias === fixture.blockPropertyAlias)?.value;
}

/**
 * Read the block's settings value straight off the element. inspect-element-blocks
 * reports contentData only, so settings round-trips go via the chained CMS tool.
 */
async function readSettingsValue(fixture: ElementBlockFixture): Promise<unknown> {
  const raw = await mcpClientManager.callTool("cms", "get-element-by-id", { id: fixture.elementId });
  const element = extractChainedResult(raw) as any;
  const propValue = (element.values ?? []).find((v: any) => v.alias === fixture.propertyAlias)?.value;
  const settingsEntry = (propValue?.settingsData ?? []).find(
    (s: any) => s.key === fixture.seededSettingsKey,
  );
  return (settingsEntry?.values ?? []).find((v: any) => v.alias === fixture.blockPropertyAlias)?.value;
}

describe("edit-element-block", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: ElementBlockFixture;

  beforeAll(async () => {
    fixture = await createElementBlockFixture(TEST_ELEMENT_NAME);
  }, 120000);

  afterAll(async () => {
    await fixture?.cleanup();
  }, 60000);

  it("should update a property inside the block and have it round-trip", async () => {
    const result = await callTool(
      editElementBlockTool,
      {
        id: fixture.elementId,
        propertyAlias: fixture.propertyAlias,
        contentKey: fixture.seededBlockKey,
        values: [{ alias: fixture.blockPropertyAlias, value: EDITED_CONTENT_VALUE }],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.contentKey).toBe(fixture.seededBlockKey);
    expect(data.updatedFields).toEqual([fixture.blockPropertyAlias]);
    expect(data.name).toBe(TEST_ELEMENT_NAME);
    // Elements are not routable — no page preview URL, matching edit-element.
    expect(data).not.toHaveProperty("previewUrl");

    expect(createSnapshotResult(result, fixture.elementId)).toMatchSnapshot();

    expect(await readBlockValue(fixture, extra)).toBe(EDITED_CONTENT_VALUE);
  }, 60000);

  it("should update the block's settings when blockType is 'settings'", async () => {
    // The caller passes the block's contentKey; the tool resolves the paired
    // settingsKey itself, because the chained CMS tool addresses a settings
    // entry by its own key.
    const result = await callTool(
      editElementBlockTool,
      {
        id: fixture.elementId,
        propertyAlias: fixture.propertyAlias,
        contentKey: fixture.seededBlockKey,
        blockType: "settings",
        values: [{ alias: fixture.blockPropertyAlias, value: EDITED_SETTINGS_VALUE }],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("settings");
    // The response still echoes the caller's contentKey, not the internal settingsKey.
    expect(data.contentKey).toBe(fixture.seededBlockKey);

    expect(await readSettingsValue(fixture)).toBe(EDITED_SETTINGS_VALUE);
    // The content side must be untouched by a settings edit.
    expect(await readBlockValue(fixture, extra)).toBe(EDITED_CONTENT_VALUE);
  }, 60000);

  it("should return an error for an unknown contentKey", async () => {
    const result = await callTool(
      editElementBlockTool,
      {
        id: fixture.elementId,
        propertyAlias: fixture.propertyAlias,
        contentKey: "99999999-9999-4999-8999-999999999999",
        values: [{ alias: fixture.blockPropertyAlias, value: "unreachable" }],
      },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 60000);

  it("should return an error for an unknown property alias on the element", async () => {
    const result = await callTool(
      editElementBlockTool,
      {
        id: fixture.elementId,
        propertyAlias: "noSuchProperty",
        contentKey: fixture.seededBlockKey,
        values: [{ alias: fixture.blockPropertyAlias, value: "unreachable" }],
      },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 60000);

  it("should return an error for a non-existent element", async () => {
    const result = await callTool(
      editElementBlockTool,
      {
        id: NON_EXISTENT_UUID,
        propertyAlias: fixture.propertyAlias,
        contentKey: fixture.seededBlockKey,
        values: [{ alias: fixture.blockPropertyAlias, value: "unreachable" }],
      },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 60000);
});
