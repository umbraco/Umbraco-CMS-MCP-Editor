/**
 * Element Builder Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { ElementBuilder } from "./element-builder.js";
import { ElementTestHelper } from "./element-test-helper.js";

const TEST_ELEMENT_NAME = "_Test ElementBuilder";

describe("ElementBuilder", () => {
  setupTestEnvironment();

  let builder: ElementBuilder | undefined;

  afterEach(async () => {
    if (builder) {
      try {
        await builder.cleanupElementType();
      } catch {
        // Best-effort
      }
      builder = undefined;
    }
    await ElementTestHelper.cleanupByName(TEST_ELEMENT_NAME);
  }, 30000);

  it("should create an element with a provisioned throwaway element type and return an ID", async () => {
    builder = await new ElementBuilder().withName(TEST_ELEMENT_NAME).create();

    expect(builder.getId()).toBeDefined();
    expect(builder.getId().length).toBeGreaterThan(0);
    expect(builder.getElementTypeId()).toBeDefined();
    expect(builder.getPropertyAlias()).toBe("title");
  }, 30000);

  it("should return a valid UUID after creation", async () => {
    builder = await new ElementBuilder().withName(TEST_ELEMENT_NAME).create();

    const id = builder.getId();
    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }, 30000);

  it("should create an element under an existing element type via withElementType()", async () => {
    const fixture = await ElementTestHelper.createElementType("_Test ElementBuilder Reuse");
    try {
      const reused = await new ElementBuilder()
        .withName(TEST_ELEMENT_NAME)
        .withElementType(fixture.id, fixture.propertyAlias)
        .create();

      expect(reused.getId()).toBeDefined();
      expect(reused.getElementTypeId()).toBe(fixture.id);
      expect(reused.getPropertyAlias()).toBe(fixture.propertyAlias);

      // withElementType() means the builder doesn't own the type — cleanup should be a no-op.
      await reused.cleanupElementType();
    } finally {
      await ElementTestHelper.cleanupElementType(fixture.id);
    }
  }, 30000);

  it("should throw if create called without name", async () => {
    const b = new ElementBuilder();
    await expect(b.create()).rejects.toThrow(/must have a name/);
  });

  it("should throw if getId called before create", () => {
    const b = new ElementBuilder();
    expect(() => b.getId()).toThrow(/No element has been created yet/);
  });

  it("should throw if getElementTypeId called before create", () => {
    const b = new ElementBuilder();
    expect(() => b.getElementTypeId()).toThrow(/No element type set/);
  });

  it("cleanup should handle non-existent element gracefully", async () => {
    await ElementTestHelper.cleanupByName("_NonExistent Element 99999");
  }, 30000);
});
