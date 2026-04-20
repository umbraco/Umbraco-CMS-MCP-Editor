import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
} from "./setup.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import listDocumentTypesTool from "../get/list-document-types.js";

describe("list-document-types", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initContentTestState(extra);
  }, 60000);

  it("should list available document types", async () => {
    const result = await listDocumentTypesTool.handler({}, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);

  it("should accept cursor parameter", async () => {
    const result = await listDocumentTypesTool.handler(
      { cursor: encodeCursor({ s: 0, t: 100 }) },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);

  it("should return no nextCursor when all results fit", async () => {
    const result = await listDocumentTypesTool.handler(
      { cursor: encodeCursor({ s: 0, t: 1000 }) },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
