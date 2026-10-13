/**
 * create-element Integration Tests
 *
 * Tests for the create-element POST tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  ElementTestHelper,
} from "./setup.js";
import createElementTool from "../post/create-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { CompositionDoctypeFixture } from "../../content/__tests__/helpers/composition-doctype-fixture.js";

const TEST_ELEMENT_NAME = "_Test Create Element";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

describe("create-element", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let elementTypeId: string;
  let lastCreatedId: string | undefined;

  beforeAll(async () => {
    const fixture = await ElementTestHelper.createElementType("_Test Create Element Type");
    elementTypeId = fixture.id;
  }, 60000);

  afterAll(async () => {
    await ElementTestHelper.cleanupElementType(elementTypeId);
  }, 30000);

  afterEach(async () => {
    if (lastCreatedId) {
      await ElementTestHelper.cleanup(lastCreatedId);
      lastCreatedId = undefined;
    }
  }, 30000);

  it("should create a draft element (allowedInLibrary type, no parent needed)", async () => {
    const result = await callTool(
      createElementTool,
      { name: TEST_ELEMENT_NAME, elementTypeId, parentId: undefined, values: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    lastCreatedId = (result.structuredContent as any)?.id;
    expect(lastCreatedId).toBeTruthy();

    expect(createSnapshotResult(result, lastCreatedId)).toMatchSnapshot();
  }, 30000);

  it("should return error for a non-existent element type", async () => {
    const result = await callTool(
      createElementTool,
      { name: TEST_ELEMENT_NAME, elementTypeId: NON_EXISTENT_UUID, parentId: undefined, values: undefined },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 30000);

  describe("composition-inherited properties (#208)", () => {
    const fixture = new CompositionDoctypeFixture();
    let hostElementTypeId: string;
    let propertyAlias: string;

    beforeAll(async () => {
      const result = await fixture.create(true);
      hostElementTypeId = result.hostDocTypeId;
      propertyAlias = result.propertyAlias;
    }, 60000);

    afterAll(async () => {
      await fixture.cleanup();
    }, 30000);

    it("resolves editorAlias for a value on a composition-inherited property and creates the element", async () => {
      const result = await callTool(
        createElementTool,
        {
          name: "_Test Create Element Composition",
          elementTypeId: hostElementTypeId,
          parentId: undefined,
          values: [{ alias: propertyAlias, value: "Composed SEO Title" }],
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;
      expect(typeof data.id).toBe("string");
    }, 30000);

    it("fails before calling Umbraco for an alias that is not a property on the element type at all", async () => {
      const result = await callTool(
        createElementTool,
        {
          name: "_Test Create Element Bogus Alias",
          elementTypeId: hostElementTypeId,
          parentId: undefined,
          values: [{ alias: "thisAliasDoesNotExistAnywhere", value: "irrelevant" }],
        },
        extra,
      );

      expect(result.isError).toBeTruthy();
      expect(JSON.stringify(result)).toContain("thisAliasDoesNotExistAnywhere");

      // No element should have been created — searching for it should find nothing.
      const found = await ElementTestHelper.findByName("_Test Create Element Bogus Alias");
      expect(found).toBeUndefined();
    }, 30000);
  });
});
