import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import getElementTool from "../get/get-element.js";

/**
 * Smoke test for the element (Library) collection.
 *
 * Validates `get-element` against a real Library element discovered from the tree
 * (the Clean starter kit seeds a "Categories" folder of Category elements). This
 * proves the get-element chaining + output shape work on the wire against Umbraco 18.
 *
 * NOTE — `create-element` is intentionally not exercised here yet. It is wired
 * correctly (its payload reaches the CMS create-element tool), but creating an
 * element of the seeded Category type returns `NotAllowed`: that element type is
 * `allowedAsRoot: false` with no allowed-child configuration, so a valid create
 * needs a self-owned element type + folder allowed-type fixture. Building that
 * fixture (via create-element-type) is tracked as follow-up — see
 * docs/upgrades/18.0.1/elements/FLOW.md.
 */
describe("element tools (smoke)", () => {
  setupTestEnvironment();
  const extra = createMockRequestHandlerExtra();

  it("get-element returns a Library element's type, values, and variants", async () => {
    // Discover a folder → an element inside it from the Library tree.
    const rootRes = await mcpClientManager.callTool("cms", "get-element-root", {});
    const root = extractChainedResult(rootRes) as any;
    const folder = (root?.items ?? []).find((i: any) => i.isFolder);
    if (!folder) {
      throw new Error("No Library element folder found in the tree");
    }
    const childrenRes = await mcpClientManager.callTool("cms", "get-element-children", { parentId: folder.id });
    const children = extractChainedResult(childrenRes) as any;
    const sampleId: string | undefined = (children?.items ?? [])[0]?.id;
    if (!sampleId) {
      throw new Error("No element found inside the Library folder to read");
    }

    const result = await callTool(getElementTool, { id: sampleId }, extra);
    expect(result.isError).toBeFalsy();
    const el = getStructuredContent(result) as any;
    expect(el.id).toBe(sampleId);
    expect(typeof el.name).toBe("string");
    expect(el.name.length).toBeGreaterThan(0);
    expect(typeof el.elementType.id).toBe("string");
    expect(el.elementType.id.length).toBeGreaterThan(0);
    expect(Array.isArray(el.values)).toBe(true);
    expect(Array.isArray(el.variants)).toBe(true);
  }, 60000);
});
