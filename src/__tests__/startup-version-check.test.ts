/**
 * Unit tests for the stdio Umbraco-major guard. CI's demo site always matches,
 * so a fake `getServerInformation` drives the mismatch / match / unreachable
 * cases, and a tool wrapped with `withStandardDecorators` (as every editor
 * tool is) proves whether the first call is blocked. Each test uses its own
 * `VersionCheckService` so no state leaks between cases.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { z } from "zod";
import {
  VersionCheckService,
  withStandardDecorators,
  type ToolDefinition,
  type VersionCheckClient,
} from "@umbraco-cms/mcp-server-sdk";
import { applyStdioVersionGuard, sanitizeVersionCheckMessage } from "../startup-version-check.js";
import { callTool } from "../testing/call-tool-with-validation.js";

const outputSchema = z.object({ ok: z.boolean() });

function buildTool() {
  const handler = jest.fn(async () => ({
    content: [{ type: "text" as const, text: "ran" }],
    structuredContent: { ok: true },
  }));
  const definition: ToolDefinition<Record<string, never>, typeof outputSchema> = {
    name: "fake-tool",
    description: "A fake tool for version-guard tests.",
    inputSchema: {},
    outputSchema,
    slices: ["read"],
    annotations: { readOnlyHint: true },
    handler,
  };
  return { tool: withStandardDecorators(definition), handler };
}

function serverReporting(version: string): VersionCheckClient {
  return { getServerInformation: async () => ({ version }) };
}

async function guard(client: VersionCheckClient) {
  return applyStdioVersionGuard({ expectedUmbracoMajor: "18", client, service: new VersionCheckService() });
}

describe("applyStdioVersionGuard", () => {
  it("on a mismatch, returns the message and blocks the first tool call once", async () => {
    const message = await guard(serverReporting("17.2.0"));
    expect(message).toMatch(/version mismatch/i);

    const { tool, handler } = buildTool();
    const blocked = await callTool(tool, {}, {});
    expect(blocked.isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    const retry = await callTool(tool, {}, {});
    expect(retry.isError).toBeFalsy();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("on a match, returns no message and blocks nothing", async () => {
    expect(await guard(serverReporting("18.3.1"))).toBeNull();

    const { tool, handler } = buildTool();
    const result = await callTool(tool, {}, {});
    expect(result.isError).toBeFalsy();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("when the CMS is unreachable, never throws and blocks nothing", async () => {
    const message = await guard({
      getServerInformation: async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      },
    });
    expect(message).toContain("Unable to verify");

    const { tool, handler } = buildTool();
    const result = await callTool(tool, {}, {});
    expect(result.isError).toBeFalsy();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("never hangs when the client's request never resolves (e.g. a stalled OAuth token fetch)", async () => {
    const message = await applyStdioVersionGuard({
      expectedUmbracoMajor: "18",
      service: new VersionCheckService(),
      timeoutMs: 50,
      // Never settles — simulates a CMS that accepts the connection but never
      // responds, including to the token request UmbracoManagementClient
      // issues before its own AbortSignal-bounded fetch even starts.
      client: { getServerInformation: () => new Promise(() => {}) },
    });
    expect(message).toContain("Unable to verify");

    const { tool, handler } = buildTool();
    const result = await callTool(tool, {}, {});
    expect(result.isError).toBeFalsy();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("sanitizeVersionCheckMessage", () => {
  it("passes a plain message through unchanged", () => {
    expect(sanitizeVersionCheckMessage("⚠️ Version Mismatch: expected 18, got 17")).toBe(
      "⚠️ Version Mismatch: expected 18, got 17",
    );
  });

  it("returns null for null", () => {
    expect(sanitizeVersionCheckMessage(null)).toBeNull();
  });

  it("strips control characters from a server-controlled value embedded in the message", () => {
    const malicious = 'Unable to verify: unparseable version "17\x1b[31mFAKE SYSTEM MESSAGE\x07"';
    const sanitized = sanitizeVersionCheckMessage(malicious);
    expect(sanitized).not.toContain("\x1b");
    expect(sanitized).not.toContain("\x07");
    expect(sanitized).toContain("FAKE SYSTEM MESSAGE"); // printable text itself is kept — only control bytes are stripped
  });

  it("caps an overlong message", () => {
    const sanitized = sanitizeVersionCheckMessage("x".repeat(1000));
    expect(sanitized!.length).toBeLessThan(400);
    expect(sanitized!.endsWith("…")).toBe(true);
  });

  it("returns null when stripping leaves nothing printable", () => {
    expect(sanitizeVersionCheckMessage("\x00\x1f\x7f")).toBeNull();
  });
});
