/**
 * Unit tests for chainCms.
 *
 * chainCms takes a chained MCP CallToolResult and re-wraps the success path as
 * { ok: true, data } or the error path as { ok: false, errorResult }. The error
 * path used to double-wrap — passing the full envelope into createToolResultError
 * produced structuredContent.structuredContent.problemDetails and the LLM
 * reported "validation failed but no detail was returned" because it looks at
 * structuredContent directly. This test pins the single-layer shape we want.
 *
 * As of `@umbraco-cms/mcp-server-sdk` beta.43, `createToolResultError` no
 * longer sets `structuredContent` on the error results it builds (intentional
 * — see `cms-chain.ts`'s `extractInnerProblemDetails` doc comment and
 * https://github.com/umbraco/Umbraco-MCP-Base/issues/343). So these tests now
 * read `errorResult`'s single-layer ProblemDetails back out of
 * `content[0].text` instead of `structuredContent` — the "no double-wrap"
 * shape being pinned is otherwise unchanged.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { getResultText } from "@umbraco-cms/mcp-server-sdk/testing";
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

    // The key assertion: errorResult's single-layer ProblemDetails (read back
    // out of content[0].text) IS the inner ProblemDetails, NOT the chained
    // envelope. Pre-fix this was nested under .structuredContent.structuredContent.
    const problemDetails = JSON.parse(getResultText(result.errorResult as any));
    expect(problemDetails).toEqual(innerProblemDetails);
    expect(problemDetails?.errors?.["$.values[0].value"])
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
    expect(JSON.parse(getResultText(result.errorResult as any))).toEqual(innerProblemDetails);
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
    const sc = JSON.parse(getResultText(result.errorResult as any));
    expect(sc).toMatchObject({
      status: 500,
      title: expect.any(String),
      detail: expect.any(String),
    });
  });

  it("preserves the raw text when content[0].text is present but not valid JSON", async () => {
    const chainedFailure = {
      isError: true,
      content: [{ type: "text" as const, text: "Something went wrong talking to Umbraco" }],
    };

    spy.mockResolvedValueOnce(chainedFailure as any);

    const result = await chainCms("get-document-by-id" as any, { id: "00000000-0000-0000-0000-000000000000" } as any);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    const sc = JSON.parse(getResultText(result.errorResult as any));
    // The real message must survive — not be replaced by a generic
    // "no structured details" placeholder that discards it.
    expect(sc.detail).toContain("Something went wrong talking to Umbraco");
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
