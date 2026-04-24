/**
 * list-recycle-bin Integration Tests
 *
 * Covers listing the bin root for both content and media, plus drilling into
 * a trashed folder via parentId. Read-only — no elicitation involved.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  RecycleBinBuilder,
  RecycleBinTestHelper,
} from "./setup.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import listRecycleBinTool from "../get/list-recycle-bin.js";

const TEST_FOLDER_NAME = "_Test List RecycleBin";
const CHILD_FOLDER_NAME = "_Test List RecycleBin Child";

describe("list-recycle-bin", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterEach(async () => {
    await RecycleBinTestHelper.cleanupByName("media", TEST_FOLDER_NAME);
    await RecycleBinTestHelper.cleanupByName("media", CHILD_FOLDER_NAME);
  }, 30000);

  it("should list the content recycle bin root without error", async () => {
    const result = await listRecycleBinTool.handler(
      { type: "content", parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));
  }, 30000);

  it("should list the media recycle bin root without error", async () => {
    const result = await listRecycleBinTool.handler(
      { type: "media", parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));
  }, 30000);

  it("should surface a freshly trashed folder and drill into its subtree", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .withNestedChild(CHILD_FOLDER_NAME)
      .create();

    // Root-level listing should include the trashed parent.
    const rootList = await listRecycleBinTool.handler(
      { type: "media", parentId: undefined, cursor: encodeCursor({ s: 0, t: 100 }) },
      extra,
    );
    expect(rootList.isError).toBeFalsy();
    const rootData = getStructuredContent(rootList) as any;
    const surfaced = (rootData.items as any[]).find(i => i.id === trashed.getId());
    expect(surfaced).toBeDefined();
    expect(surfaced.hasChildren).toBe(true);

    // Drill into the parent — the child should be present.
    const childList = await listRecycleBinTool.handler(
      { type: "media", parentId: trashed.getId() },
      extra,
    );
    expect(childList.isError).toBeFalsy();
    const childData = getStructuredContent(childList) as any;
    expect(childData.items).toBeInstanceOf(Array);
    expect(childData.items.length).toBeGreaterThanOrEqual(1);
    expect(childData.items.some((i: any) => i.name === CHILD_FOLDER_NAME)).toBe(true);
  }, 90000);
});
