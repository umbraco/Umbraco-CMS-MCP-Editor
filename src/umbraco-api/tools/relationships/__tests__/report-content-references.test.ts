import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initRelationshipsTestState,
} from "./setup.js";
import reportContentReferencesTool from "../get/report-content-references.js";

describe("report-content-references", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testMediaId: string;

  beforeAll(async () => {
    const state = await initRelationshipsTestState(extra);
    testPageId = state.testPageId;
    testMediaId = state.testMediaId;
  }, 60000);

  it("should return referencedBy array and referenceCount for a known page", async () => {
    const result = await reportContentReferencesTool.handler(
      { id: testPageId, type: "document" },
      extra,
    );

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);

  it("should return referencedBy and referenceCount for a media item", async () => {
    const result = await reportContentReferencesTool.handler(
      { id: testMediaId, type: "media" },
      extra,
    );

    expect(createSnapshotResult(result, testMediaId)).toMatchSnapshot();
  }, 30000);
});
