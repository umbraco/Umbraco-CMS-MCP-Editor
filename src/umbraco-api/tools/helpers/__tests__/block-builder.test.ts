/**
 * Unit tests for toNewBlockProperties's chained-404 handling
 * (Umbraco-CMS-MCP-Editor#200).
 *
 * A non-404 error from the chained `get-document-type-by-id` call (e.g. a
 * permissions failure or a real server error) isn't practically provokable
 * against a real Umbraco instance, so — following the same
 * jest.spyOn(mcpClientManager, "callTool") pattern as cms-chain.test.ts and
 * resolve-document-type-properties.test.ts — this stubs it directly instead
 * of running against a live CMS.
 */

import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { toNewBlockProperties } from "../block-builder.js";
import { mcpClientManager } from "../../../mcp-client.js";

describe("toNewBlockProperties", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a friendly 404 naming contentTypeKey when the content element type is stale", async () => {
    jest.spyOn(mcpClientManager, "callTool").mockImplementation(async () => ({
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ type: "Error", title: "Not Found", status: 404, detail: "The specified document type was not found" }) }],
    }));

    const result = await toNewBlockProperties(
      "stale-content-type-key",
      [{ alias: "someAlias", value: "x" }],
      undefined,
      undefined,
      null,
      null,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    const text = JSON.stringify(result.errorResult);
    expect(text).toContain("404");
    expect(text).toContain("Element type not found");
    expect(text).toContain("contentTypeKey");
    expect(text).toContain("stale-content-type-key");
    expect(text).not.toContain("settingsTypeKey");
  });

  it("returns a friendly 404 naming settingsTypeKey (not contentTypeKey) when only the settings element type is stale", async () => {
    jest.spyOn(mcpClientManager, "callTool").mockImplementation(async (_server: unknown, _toolName: unknown, args?: unknown) => {
      const id = (args as { id: string }).id;
      if (id === "good-content-type-key") {
        return { isError: false, structuredContent: { properties: [] }, content: [] };
      }
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ type: "Error", title: "Not Found", status: 404, detail: "The specified document type was not found" }) }],
      };
    });

    const result = await toNewBlockProperties(
      "good-content-type-key",
      [{ alias: "someAlias", value: "x" }],
      "stale-settings-type-key",
      [{ alias: "someSettingAlias", value: "y" }],
      null,
      null,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    const text = JSON.stringify(result.errorResult);
    expect(text).toContain("settingsTypeKey");
    expect(text).toContain("stale-settings-type-key");
    expect(text).not.toContain("contentTypeKey");
  });

  it("passes a non-404 error through unchanged, rather than the friendly 404", async () => {
    jest.spyOn(mcpClientManager, "callTool").mockImplementation(async () => ({
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ type: "Error", title: "Internal Server Error", status: 500, detail: "The server encountered an unexpected error" }) }],
    }));

    const result = await toNewBlockProperties(
      "some-content-type-key",
      [{ alias: "someAlias", value: "x" }],
      undefined,
      undefined,
      null,
      null,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    const text = JSON.stringify(result.errorResult);
    expect(text).toContain("500");
    expect(text).toContain("Internal Server Error");
    expect(text).not.toContain("Element type not found");
  });
});
