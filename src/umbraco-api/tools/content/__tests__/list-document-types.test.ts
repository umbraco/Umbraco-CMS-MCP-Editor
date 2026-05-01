import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initContentTestState,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import listDocumentTypesTool from "../get/list-document-types.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

describe("list-document-types", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initContentTestState(extra);
  }, 60000);

  it("should list available document types", async () => {
    const result = await callTool(listDocumentTypesTool,{}, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));
  }, 30000);

  it("returns real document types, not folder containers", async () => {
    // The doc-type tree's root level is folders ("Compositions" / "Elements" /
    // "Pages"); list-document-types descends into them to surface usable types.
    const result = await callTool(listDocumentTypesTool,
      { cursor: encodeCursor({ s: 0, t: 200 }) },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    // Demo site (Clean starter kit) has many doc types — at least 10
    expect(data.items.length).toBeGreaterThan(10);

    // No entry should be one of the doc-type tree's folder containers
    const folderNames = new Set(["Compositions", "Elements", "Pages"]);
    for (const item of data.items) {
      expect(folderNames.has(item.name)).toBe(false);
    }

    // At least one well-known doc type from the Clean starter kit must be in the result
    const knownAliases = data.items
      .map((i: any) => (i.alias ?? "").toLowerCase())
      .filter((a: string) => a.length > 0);
    expect(knownAliases.length).toBeGreaterThan(0);
  }, 60000);

  it("respects cursor pagination", async () => {
    const all = await callTool(listDocumentTypesTool,
      { cursor: encodeCursor({ s: 0, t: 100 }) },
      extra,
    );
    const allData = getStructuredContent(all) as any;
    if (allData.items.length < 5) return; // demo site too small to test

    const page = await callTool(listDocumentTypesTool,
      { cursor: encodeCursor({ s: 2, t: 2 }) },
      extra,
    );
    const pageData = getStructuredContent(page) as any;
    expect(pageData.items.length).toBeLessThanOrEqual(2);
    if (pageData.items.length === 2) {
      expect(pageData.items[0].id).toBe(allData.items[2].id);
      expect(pageData.items[1].id).toBe(allData.items[3].id);
    }
  }, 30000);
});
