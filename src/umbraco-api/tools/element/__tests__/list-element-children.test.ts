/**
 * list-element-children Integration Tests
 *
 * Tests for the list-element-children GET tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  ElementBuilder,
  ElementTestHelper,
} from "./setup.js";
import listElementChildrenTool from "../get/list-element-children.js";
import createElementFolderTool from "../post/create-element-folder.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";

// Element folder names are enforced unique even across the recycle bin (a
// trashed folder of the same name blocks reuse), so give the folder a random
// suffix and permanently delete it afterwards — matching create-element-folder.test.ts.
const TEST_FOLDER_NAME = `_Test List Element Children Folder ${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const TEST_ELEMENT_NAME = "_Test List Element Children";

async function permanentlyDeleteFolder(id: string): Promise<void> {
  try {
    await mcpClientManager.callTool("cms", "move-element-folder-to-recycle-bin", { id });
  } catch {
    // May already be trashed
  }
  try {
    await mcpClientManager.callTool("cms", "delete-element-folder-from-recycle-bin", { id });
  } catch {
    // Best-effort
  }
}

describe("list-element-children", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let folderId: string;
  let element: ElementBuilder;

  beforeAll(async () => {
    const folderResult = await callTool(createElementFolderTool, { name: TEST_FOLDER_NAME }, extra);
    expect(folderResult.isError).toBeFalsy();
    folderId = (getStructuredContent(folderResult) as any).id;
    expect(folderId).toBeTruthy();

    element = await new ElementBuilder()
      .withName(TEST_ELEMENT_NAME)
      .withParent(folderId)
      .create();
  }, 60000);

  afterAll(async () => {
    if (element) {
      await ElementTestHelper.cleanup(element.getId());
      await element.cleanupElementType();
    }
    if (folderId) {
      await permanentlyDeleteFolder(folderId);
    }
  }, 30000);

  it("should return the elements under a folder", async () => {
    const result = await callTool(listElementChildrenTool, { parentId: folderId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.total).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      id: element.getId(),
      name: TEST_ELEMENT_NAME,
      isFolder: false,
    });
  }, 30000);

  it("should return the Library root including the created folder", async () => {
    const result = await callTool(listElementChildrenTool, { take: 100, skip: 0 }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(Array.isArray(data.items)).toBe(true);
    const found = data.items.find((item: any) => item.id === folderId);
    expect(found).toMatchObject({ id: folderId, name: TEST_FOLDER_NAME, isFolder: true });
  }, 30000);
});
