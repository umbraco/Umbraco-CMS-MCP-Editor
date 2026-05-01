import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initContentTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import getDocumentTypeTool from "../get/get-document-type.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

describe("get-document-type", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testDocumentTypeId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  it("returns the property schema for a document type", async () => {
    const result = await callTool(getDocumentTypeTool, { id: testDocumentTypeId }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(typeof data.alias).toBe("string");
    expect(data.alias.length).toBeGreaterThan(0);
    expect(typeof data.name).toBe("string");
    expect(Array.isArray(data.properties)).toBe(true);
  }, 30000);

  it("returns a non-empty properties array for a doc type that has properties", async () => {
    // Properties are commonly inherited via compositions — get-document-type.ts
    // walks compositions to merge them into the result.
    const result = await callTool(getDocumentTypeTool, { id: testDocumentTypeId }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.properties.length).toBeGreaterThan(0);
    for (const prop of data.properties) {
      expect(typeof prop.alias).toBe("string");
      expect(prop.alias.length).toBeGreaterThan(0);
      expect(typeof prop.name).toBe("string");
    }
  }, 30000);

  it("returns an error for a non-existent document type", async () => {
    const result = await callTool(getDocumentTypeTool, { id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);
});
