import { describe, it, expect, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import getElementTool from "../get/get-element.js";
import listElementChildrenTool from "../get/list-element-children.js";
import searchElementsTool from "../get/search-elements.js";
import createElementFolderTool from "../post/create-element-folder.js";

/**
 * Smoke test for the element (Library) collection. Validates the read + folder
 * tools against the live Umbraco 18 instance, using the Clean starter kit's
 * seeded "Categories" folder of Category elements for discovery.
 *
 * NOTE — create-element / edit-element / publish-element / unpublish-element /
 * delete-element (on element items) are not exercised here yet: creating an
 * element needs an element type configured to be creatable (the seeded Category
 * type is `allowedAsRoot: false` with no allowed-child config, so create returns
 * `NotAllowed`). A dedicated element-type + folder fixture (via create-element-type)
 * will unblock full CRUD coverage — see docs/upgrades/18.0.1/elements/FLOW.md.
 */
describe("element tools (smoke)", () => {
  setupTestEnvironment();
  const extra = createMockRequestHandlerExtra();

  const nameOf = (i: any) => i.variants?.[0]?.name ?? i.name ?? "";

  // Best-effort cleanup of any _smoke-folder-* folders left at the Library root
  // (keeps repeated local runs tidy; CI runs against a fresh DB anyway).
  afterAll(async () => {
    const rootRes = await mcpClientManager.callTool("cms", "get-element-root", {}).catch(() => null);
    const root = rootRes ? (extractChainedResult(rootRes) as any) : null;
    for (const i of (root?.items ?? []).filter((x: any) => x.isFolder && nameOf(x).startsWith("_smoke-folder-"))) {
      await mcpClientManager.callTool("cms", "move-element-folder-to-recycle-bin", { id: i.id }).catch(() => {});
    }
  }, 60000);

  // Find a folder that actually contains an element item (skip empty folders,
  // including any leftover _smoke-folder-* from previous runs).
  async function discover() {
    const rootRes = await mcpClientManager.callTool("cms", "get-element-root", {});
    const root = extractChainedResult(rootRes) as any;
    const folders = (root?.items ?? []).filter((i: any) => i.isFolder);
    if (folders.length === 0) throw new Error("No Library element folder found in the tree");
    for (const folder of folders) {
      const childrenRes = await mcpClientManager.callTool("cms", "get-element-children", { parentId: folder.id });
      const children = extractChainedResult(childrenRes) as any;
      const sample = (children?.items ?? []).find((c: any) => !c.isFolder);
      if (sample) {
        return { folderId: folder.id, folderName: nameOf(folder), sampleId: sample.id, sampleName: nameOf(sample) };
      }
    }
    throw new Error("No element item found inside any Library folder");
  }

  it("list-element-children lists the Library root and a folder's children", async () => {
    const { folderId, sampleId } = await discover();

    const rootResult = await callTool(listElementChildrenTool, {}, extra);
    expect(rootResult.isError).toBeFalsy();
    const rootData = getStructuredContent(rootResult) as any;
    expect(Array.isArray(rootData.items)).toBe(true);
    expect(rootData.items.some((i: any) => i.id === folderId && i.isFolder)).toBe(true);

    const childResult = await callTool(listElementChildrenTool, { parentId: folderId }, extra);
    expect(childResult.isError).toBeFalsy();
    const childData = getStructuredContent(childResult) as any;
    expect(childData.items.some((i: any) => i.id === sampleId)).toBe(true);
  }, 60000);

  it("get-element returns an element's type, values, and variants", async () => {
    const { sampleId } = await discover();
    const result = await callTool(getElementTool, { id: sampleId }, extra);
    expect(result.isError).toBeFalsy();
    const el = getStructuredContent(result) as any;
    expect(el.id).toBe(sampleId);
    expect(el.name.length).toBeGreaterThan(0);
    expect(el.elementType.id.length).toBeGreaterThan(0);
    expect(Array.isArray(el.values)).toBe(true);
    expect(Array.isArray(el.variants)).toBe(true);
  }, 60000);

  it("search-elements finds an element by name", async () => {
    const { sampleName, sampleId } = await discover();
    const result = await callTool(searchElementsTool, { query: sampleName }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.items.some((i: any) => i.id === sampleId)).toBe(true);
  }, 60000);

  it("create-element-folder creates a Library folder (and delete moves it to the bin)", async () => {
    const name = `_smoke-folder-${Date.now()}`;
    const createResult = await callTool(createElementFolderTool, { name }, extra);
    expect(createResult.isError).toBeFalsy();
    const created = getStructuredContent(createResult) as any;
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.name).toBe(name);

    // The folder should now appear at the Library root.
    const rootResult = await callTool(listElementChildrenTool, {}, extra);
    const rootData = getStructuredContent(rootResult) as any;
    expect(rootData.items.some((i: any) => i.id === created.id)).toBe(true);

    // Clean up: delete the folder we created (via the CMS folder recycle-bin move).
    await mcpClientManager.callTool("cms", "move-element-folder-to-recycle-bin", { id: created.id }).catch(() => {});
  }, 60000);
});
