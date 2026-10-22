/**
 * Thin wrapper test for the stdio major-version guard (src/index.ts).
 *
 * CI's demo site is always version-matched, so there's no way to exercise a
 * live mismatch through the full integration stack. Instead this feeds a fake
 * `getServerInformation` into the real `checkUmbracoVersion` +
 * `configureVersionCheckHook` from @umbraco-cms/mcp-server-sdk, then runs a
 * tool wrapped with the same `withStandardDecorators` every editor tool uses,
 * asserting:
 *   - a mismatch blocks the first decorated tool call
 *   - a retry after that block succeeds (the hook clears itself after
 *     surfacing the message once)
 *   - a match blocks nothing
 */
import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { z } from "zod";
import {
  checkUmbracoVersion,
  configureVersionCheckHook,
  clearVersionCheckMessage,
  withStandardDecorators,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { callTool } from "../testing/call-tool-with-validation.js";

const inputSchema = {};
const outputSchema = z.object({ ok: z.boolean() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTool(handler: (...args: any[]) => any) {
  const definition: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
    name: "fake-tool",
    description: "A fake tool for version-guard tests.",
    inputSchema,
    outputSchema,
    slices: ["read"],
    annotations: { readOnlyHint: true },
    handler,
  };
  return withStandardDecorators(definition);
}

/** Extracts the text MCP clients would see from a tool call result. */
function resultText(result: { content?: { type: string; text?: string }[] }): string {
  return result.content?.map((c) => c.text ?? "").join("\n") ?? "";
}

describe("stdio Umbraco major-version guard (checkUmbracoVersion + configureVersionCheckHook)", () => {
  afterEach(() => {
    // Reset the SDK's version-check singleton between cases (Requirement 7).
    clearVersionCheckMessage();
  });

  it("blocks the first decorated tool call on a major mismatch, and a retry after it succeeds", async () => {
    await checkUmbracoVersion({
      mcpVersion: "18.0.0-beta.9",
      expectedUmbracoMajor: "18",
      client: {
        getServerInformation: async () => ({ version: "17.2.0" }),
      },
    });
    configureVersionCheckHook();

    const handler = jest.fn(async () => ({ content: [{ type: "text", text: "ran" }] }));
    const tool = buildTool(handler);

    // First call: blocked, original handler never runs.
    const blockedResult = await callTool(tool, {}, {});
    expect(handler).not.toHaveBeenCalled();
    expect(blockedResult.isError).toBe(true);
    expect(resultText(blockedResult)).toMatch(/version mismatch/i);
    expect(resultText(blockedResult)).toMatch(/18\.x/);
    expect(resultText(blockedResult)).toMatch(/17\.x/);

    // Retry: the hook cleared itself after surfacing the message once, so
    // this call reaches the original handler.
    const retryResult = await callTool(tool, {}, {});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(retryResult.isError).toBeFalsy();
  });

  it("blocks nothing when the connected major matches", async () => {
    await checkUmbracoVersion({
      mcpVersion: "18.0.0-beta.9",
      expectedUmbracoMajor: "18",
      client: {
        getServerInformation: async () => ({ version: "18.1.2" }),
      },
    });
    configureVersionCheckHook();

    const handler = jest.fn(async () => ({ content: [{ type: "text", text: "ran" }] }));
    const tool = buildTool(handler);

    const result = await callTool(tool, {}, {});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeFalsy();
  });

  it("never throws and does not block when the CMS is unreachable at startup", async () => {
    await expect(
      checkUmbracoVersion({
        mcpVersion: "18.0.0-beta.9",
        expectedUmbracoMajor: "18",
        client: {
          getServerInformation: async () => {
            throw new Error("fetch failed: ECONNREFUSED");
          },
        },
      }),
    ).resolves.toBeUndefined();
    configureVersionCheckHook();

    const handler = jest.fn(async () => ({ content: [{ type: "text", text: "ran" }] }));
    const tool = buildTool(handler);

    const result = await callTool(tool, {}, {});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeFalsy();
  });
});
