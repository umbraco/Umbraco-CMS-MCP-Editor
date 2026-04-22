import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import getDocumentTypeTool from "../get/get-document-type.js";

describe("get-document-type", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testDocumentTypeId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  it("returns the property schema for a document type", async () => {
    const result = await getDocumentTypeTool.handler({ id: testDocumentTypeId }, extra);
    expect(createSnapshotResult(result, testDocumentTypeId)).toMatchSnapshot();
  }, 30000);

  it("returns an error for a non-existent document type", async () => {
    const result = await getDocumentTypeTool.handler({ id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);
});
