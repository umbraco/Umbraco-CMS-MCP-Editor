import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import listMediaTypesTool from "../get/list-media-types.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

describe("list-media-types", () => {
  setupTestEnvironment();

  it(
    "should list allowed media types at root",
    async () => {
      const extra = createMockRequestHandlerExtra();
      const result = await callTool(listMediaTypesTool, { parentId: undefined }, extra);
      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
    },
    30000,
  );

  it("returns a non-empty alias for every item", async () => {
    // The chained allowed-children/allowed-at-root endpoints don't include
    // alias, so list-media-types fetches each item's full details by id.
    const extra = createMockRequestHandlerExtra();
    const result = await callTool(listMediaTypesTool, { parentId: undefined }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    expect(data.items.length).toBeGreaterThan(0);
    for (const item of data.items) {
      expect(typeof item.alias).toBe("string");
      expect(item.alias.length).toBeGreaterThan(0);
    }
  }, 30000);
});
