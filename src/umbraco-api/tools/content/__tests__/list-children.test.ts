import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
} from "./setup.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import listChildrenTool from "../get/list-children.js";

describe("list-children", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initContentTestState(extra);
  }, 60000);

  it("should return root-level pages", async () => {
    const result = await listChildrenTool.handler({ parentId: undefined }, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);

  it("should accept cursor parameter", async () => {
    const result = await listChildrenTool.handler(
      { parentId: undefined, cursor: encodeCursor({ s: 0, t: 100 }) },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
