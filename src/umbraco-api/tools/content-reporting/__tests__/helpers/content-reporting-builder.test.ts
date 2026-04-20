/**
 * Content Reporting Builder Tests
 *
 * Verifies that the ContentReportingBuilder import works correctly and that
 * the ContentReportingTestHelper can verify connectivity to a live Umbraco
 * instance via the report-recently-changed tool.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { ContentReportingBuilder } from "./content-reporting-builder.js";
import { ContentReportingTestHelper } from "./content-reporting-test-helper.js";

describe("ContentReportingBuilder", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await ContentReportingTestHelper.verifyConnectivity(extra);
  }, 60000);

  it("should re-export ContentBuilder as ContentReportingBuilder", () => {
    expect(ContentReportingBuilder).toBeDefined();
    expect(typeof ContentReportingBuilder).toBe("function");
  });

  it("should be instantiable via ContentReportingBuilder", () => {
    const builder = new ContentReportingBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
    expect(typeof builder.withDocumentType).toBe("function");
  });

  it("should verify connectivity via ContentReportingTestHelper", async () => {
    // verifyConnectivity runs in beforeAll — if we reach this test, it passed
    await expect(
      ContentReportingTestHelper.verifyConnectivity(extra),
    ).resolves.toBeUndefined();
  }, 30000);

  it("should normalizeIds replace UUIDs with placeholder", () => {
    const input = {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Test Page",
      nested: {
        parentId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        label: "keep-me",
      },
      items: [{ id: "00000000-1111-2222-3333-444444444444", count: 5 }],
    };

    const normalized = ContentReportingTestHelper.normalizeIds(input) as any;

    expect(normalized.id).toBe("00000000-0000-0000-0000-000000000000");
    expect(normalized.name).toBe("Test Page");
    expect(normalized.nested.parentId).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(normalized.nested.label).toBe("keep-me");
    expect(normalized.items[0].id).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(normalized.items[0].count).toBe(5);
  });
});
