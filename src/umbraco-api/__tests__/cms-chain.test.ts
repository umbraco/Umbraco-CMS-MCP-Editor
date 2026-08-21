/**
 * Unit tests for chainCms.
 *
 * chainCms takes a chained MCP CallToolResult and re-wraps the success path as
 * { ok: true, data } or the error path as { ok: false, errorResult }. The error
 * path used to double-wrap — passing the full envelope into createToolResultError
 * produced structuredContent.structuredContent.problemDetails and the LLM
 * reported "validation failed but no detail was returned" because it looks at
 * structuredContent directly. This test pins the single-layer shape we want.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { chainCms } from "../cms-chain.js";
import { mcpClientManager } from "../mcp-client.js";

describe("chainCms", () => {
  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    spy = jest.spyOn(mcpClientManager, "callTool");
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("surfaces the inner ProblemDetails on the chained error path (no double-wrap)", async () => {
    const innerProblemDetails = {
      type: "Error",
      title: "Validation failed",
      status: 400,
      detail: "One or more properties did not pass validation",
      errors: { "$.values[0].value": ["The required property 'pageTitle' was empty."] },
    };
    const chainedFailure = {
      isError: true,
      structuredContent: innerProblemDetails,
      content: [{ type: "text" as const, text: JSON.stringify(innerProblemDetails) }],
    };

    spy.mockResolvedValueOnce(chainedFailure as any);

    // Cast through unknown because the test deliberately feeds a fake tool name.
    const result = await chainCms("validate-document" as any, {} as any);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");

    expect(result.errorResult.isError).toBe(true);

    // The key assertion: our errorResult.structuredContent IS the ProblemDetails,
    // NOT the chained envelope. Pre-fix this is nested under .structuredContent.
    expect(result.errorResult.structuredContent).toEqual(innerProblemDetails);
    expect((result.errorResult.structuredContent as any)?.errors?.["$.values[0].value"])
      .toEqual(["The required property 'pageTitle' was empty."]);
  });

  it("parses content[0].text when structuredContent is absent", async () => {
    const innerProblemDetails = {
      type: "Error",
      title: "Not found",
      status: 404,
      detail: "The document could not be found",
    };
    const chainedFailure = {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify(innerProblemDetails) }],
    };

    spy.mockResolvedValueOnce(chainedFailure as any);

    const result = await chainCms("get-document-by-id" as any, { id: "00000000-0000-0000-0000-000000000000" } as any);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.errorResult.structuredContent).toEqual(innerProblemDetails);
  });

  it("falls back to a synthesized ProblemDetails when neither structuredContent nor text is available", async () => {
    const chainedFailure = {
      isError: true,
      content: [],
    };

    spy.mockResolvedValueOnce(chainedFailure as any);

    const result = await chainCms("get-document-by-id" as any, { id: "00000000-0000-0000-0000-000000000000" } as any);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    const sc = result.errorResult.structuredContent as any;
    expect(sc).toMatchObject({
      status: 500,
      title: expect.any(String),
      detail: expect.any(String),
    });
  });

  it("normalizes a thrown protocol-level error (e.g. the chained tool's own output failing its output schema) to { ok: false }", async () => {
    // A malformed response from the chained CMS tool surfaces as a thrown
    // McpError from the underlying stdio client, not a resolved isError
    // result — chainCms must not let that escape as an uncaught rejection.
    spy.mockRejectedValueOnce(new Error("MCP error -32602: Structured content does not match the tool's output schema"));

    const result = await chainCms("get-document-public-access" as any, { id: "00000000-0000-0000-0000-000000000000" } as any);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.errorResult.isError).toBe(true);
    const sc = result.errorResult.structuredContent as any;
    expect(sc.detail).toContain("get-document-public-access");
    expect(sc.detail).toContain("-32602");
  });

  it("returns ok with extracted data on the success path", async () => {
    const successData = { id: "abc", name: "Test" };
    const chainedSuccess = {
      isError: false,
      structuredContent: successData,
      content: [{ type: "text" as const, text: JSON.stringify(successData) }],
    };

    spy.mockResolvedValueOnce(chainedSuccess as any);

    const result = await chainCms("get-document-by-id" as any, { id: "00000000-0000-0000-0000-000000000000" } as any);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success result");
    expect(result.data).toEqual(successData);
  });
});
