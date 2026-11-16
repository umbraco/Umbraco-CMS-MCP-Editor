import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  initContentTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { getStructuredContent, getResultText } from "@umbraco-cms/mcp-server-sdk/testing";
import getDocumentTypeTool from "../get/get-document-type.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { CompositionDoctypeFixture } from "./helpers/composition-doctype-fixture.js";

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

  it("returns a friendly 404 for a non-existent document type, naming the id and pointing at list-document-types", async () => {
    const result = await callTool(getDocumentTypeTool, { id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
    const problemDetails = JSON.parse(getResultText(result)) as { status?: unknown; title?: unknown; detail?: unknown };
    expect(problemDetails).toMatchObject({
      status: 404,
      title: "Document type not found",
    });
    expect(String(problemDetails.detail)).toContain(NON_EXISTENT_UUID);
    expect(String(problemDetails.detail)).toContain("list-document-types");
  }, 30000);

  describe("with a composition", () => {
    const fixture = new CompositionDoctypeFixture();
    let hostDocTypeId: string;
    let propertyAlias: string;

    beforeAll(async () => {
      const created = await fixture.create();
      hostDocTypeId = created.hostDocTypeId;
      propertyAlias = created.propertyAlias;
    }, 60000);

    afterAll(async () => {
      await fixture.cleanup();
    }, 60000);

    it("merges properties inherited through a composition into the host's property list (no warnings)", async () => {
      const result = await callTool(getDocumentTypeTool, { id: hostDocTypeId }, extra);
      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      // The host doc type has NO properties of its own — this alias only
      // appears if the composition walk actually merged it in.
      expect(data.properties.map((p: any) => p.alias)).toContain(propertyAlias);
      expect(data.warnings).toBeUndefined();
    }, 30000);
  });
});
