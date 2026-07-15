/**
 * create-element-folder Integration Tests
 *
 * Tests for the create-element-folder POST tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { randomUUID } from "node:crypto";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  extractChainedResult,
} from "./setup.js";
import createElementFolderTool from "../post/create-element-folder.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";

// Element folder names appear to be enforced unique beyond just their direct
// parent (even a previously-trashed folder of the same name can block reuse),
// so give every folder a random suffix — matching the pattern
// ElementTestHelper already uses for element type aliases.
function uniqueFolderName(label: string): string {
  return `_Test Create Element Folder ${label} ${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

// Permanently delete (not just trash) so repeated local runs don't accumulate
// containers that could collide with future unique names.
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

describe("create-element-folder", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdIds: string[] = [];

  afterEach(async () => {
    for (const id of createdIds) {
      await permanentlyDeleteFolder(id);
    }
    createdIds = [];
  }, 30000);

  it("should create a folder at the Library root", async () => {
    const name = uniqueFolderName("Root");
    const result = await callTool(createElementFolderTool, { name, parentId: undefined }, extra);

    const data = getStructuredContent(result) as any;
    if (data?.id) createdIds.push(data.id);

    expect(result.isError).toBeFalsy();
    expect(data).toBeDefined();
    expect(data.message).toContain("Created");
    expect(data.message).toContain("at the root");
    expect(data.name).toBe(name);
    expect(data.id).toBeTruthy();
  }, 30000);

  it("should return error for a duplicate folder name at the same parent", async () => {
    const name = uniqueFolderName("Duplicate");
    const first = await callTool(createElementFolderTool, { name, parentId: undefined }, extra);
    const firstData = getStructuredContent(first) as any;
    if (firstData?.id) createdIds.push(firstData.id);
    expect(first.isError).toBeFalsy();

    const second = await callTool(createElementFolderTool, { name, parentId: undefined }, extra);

    expect(second.isError).toBe(true);
  }, 30000);

  it("should create a nested folder under a parent folder", async () => {
    const parentName = uniqueFolderName("Parent");
    const childName = uniqueFolderName("Child");

    const parentResult = await callTool(createElementFolderTool, { name: parentName, parentId: undefined }, extra);
    const parentData = getStructuredContent(parentResult) as any;
    if (parentData?.id) createdIds.push(parentData.id);
    expect(parentResult.isError).toBeFalsy();
    expect(parentData.id).toBeTruthy();

    const childResult = await callTool(
      createElementFolderTool,
      { name: childName, parentId: parentData.id },
      extra,
    );
    const childData = getStructuredContent(childResult) as any;
    if (childData?.id) createdIds.push(childData.id);

    expect(childResult.isError).toBeFalsy();
    expect(childData.name).toBe(childName);
    expect(childData.message).toContain(parentName);
    expect(childData.id).toBeTruthy();

    // Verify the child actually landed under the parent, not the Library root.
    const childrenResult = await mcpClientManager.callTool("cms", "get-element-children", {
      parentId: parentData.id,
    });
    const childrenData = extractChainedResult(childrenResult) as any;
    const found = (childrenData.items ?? []).find((item: any) => item.id === childData.id);
    expect(found).toBeDefined();
    expect(found.name ?? found.variants?.[0]?.name).toBe(childName);

    const rootResult = await mcpClientManager.callTool("cms", "get-element-root", {});
    const rootData = extractChainedResult(rootResult) as any;
    expect((rootData.items ?? []).some((item: any) => item.id === childData.id)).toBe(false);
  }, 30000);
});
