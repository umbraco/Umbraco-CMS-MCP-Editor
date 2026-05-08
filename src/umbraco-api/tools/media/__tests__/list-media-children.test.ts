import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";

import listMediaChildrenTool from "../get/list-media-children.js";

describe("list-media-children", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return root-level media items", async () => {
    const result = await listMediaChildrenTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.total).toEqual(expect.any(Number));

    // Verify item shape
    expect(data.items[0]).toHaveProperty("id");
    expect(data.items[0]).toHaveProperty("name");
  }, 30000);
});
