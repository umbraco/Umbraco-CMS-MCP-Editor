/**
 * Unit tests for publish-with-descendants.ts.
 *
 * `publish-document-with-descendants` is asynchronous and can't be forced
 * into its "still running after 60s" branch against the small demo-site
 * tree the integration suite runs on, so the follow-up-polling path is
 * exercised here by stubbing mcpClientManager.callTool (same approach as
 * validate-document.test.ts), with fake timers standing in for the
 * poll interval.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { publishWithDescendants, parsePublishWithDescendantsStatus } from "../publish-with-descendants.js";
import { mcpClientManager } from "../../../mcp-client.js";

const DOC_ID = "00000000-0000-0000-0000-000000000001";
const TASK_ID = "00000000-0000-0000-0000-000000000002";
const PUBLISH_DATA = { includeUnpublishedDescendants: false, cultures: [] };

/**
 * A real MCP client request timeout rejects the underlying `client.request(...)`
 * call with an `McpError` — it never resolves with an `isError: true` result —
 * so simulate it the same way `chainCms`'s catch block would actually see it.
 */
function throwRequestTimeout(): never {
  throw new Error("MCP error -32001: Request timed out");
}

describe("parsePublishWithDescendantsStatus", () => {
  let warnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("treats the empty-string success payload as complete", () => {
    expect(parsePublishWithDescendantsStatus("")).toEqual({ complete: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("treats an unrelated object as complete, but warns about the unrecognized shape", () => {
    expect(parsePublishWithDescendantsStatus({ foo: "bar" })).toEqual({ complete: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("parses the in-progress payload", () => {
    expect(
      parsePublishWithDescendantsStatus({ status: "in-progress", taskId: TASK_ID, message: "still going" }),
    ).toEqual({ complete: false, taskId: TASK_ID });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("ignores status in-progress without a string taskId, and warns", () => {
    expect(parsePublishWithDescendantsStatus({ status: "in-progress" })).toEqual({ complete: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("publishWithDescendants", () => {
  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    spy = jest.spyOn(mcpClientManager, "callTool");
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("returns complete immediately when the initial call finishes inline", async () => {
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        return { isError: false, content: [{ type: "text", text: '""' }] };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const result = await publishWithDescendants(DOC_ID, PUBLISH_DATA);

    expect(result).toEqual({ ok: true, complete: true });
  });

  it("surfaces an error result if the initial call fails for a real reason", async () => {
    const problemDetails = { type: "Error", title: "Not Found", status: 404, detail: "document not found" };
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        return {
          isError: true,
          structuredContent: problemDetails,
          content: [{ type: "text", text: JSON.stringify(problemDetails) }],
        };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const result = await publishWithDescendants(DOC_ID, PUBLISH_DATA);

    expect(result.ok).toBe(false);
  });

  it("treats a request timeout on the initial call as still-running, not a failure", async () => {
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        throwRequestTimeout();
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const result = await publishWithDescendants(DOC_ID, PUBLISH_DATA);

    // No taskId was ever returned, so there's nothing to follow up with —
    // report inconclusive rather than a hard failure that invites a retry.
    expect(result).toEqual({ ok: true, complete: false });
  });

  it("polls get-document-publish-with-descendants-result until complete", async () => {
    let pollCount = 0;
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ status: "in-progress", taskId: TASK_ID, message: "still going" }) }],
        };
      }
      if (toolName === "get-document-publish-with-descendants-result") {
        pollCount++;
        return {
          isError: false,
          structuredContent: { taskId: TASK_ID, isComplete: pollCount >= 3 },
        };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const resultPromise = publishWithDescendants(DOC_ID, PUBLISH_DATA);
    await jest.advanceTimersByTimeAsync(2000 * 3);
    const result = await resultPromise;

    expect(result).toEqual({ ok: true, complete: true });
    expect(pollCount).toBe(3);
  });

  it("does not poll at all when followUp is false, reporting in-progress immediately", async () => {
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ status: "in-progress", taskId: TASK_ID, message: "still going" }) }],
        };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const result = await publishWithDescendants(DOC_ID, PUBLISH_DATA, { followUp: false });

    expect(result).toEqual({ ok: true, complete: false });
  });

  it("reports not complete after exhausting the follow-up attempts", async () => {
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ status: "in-progress", taskId: TASK_ID, message: "still going" }) }],
        };
      }
      if (toolName === "get-document-publish-with-descendants-result") {
        return { isError: false, structuredContent: { taskId: TASK_ID, isComplete: false } };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const resultPromise = publishWithDescendants(DOC_ID, PUBLISH_DATA);
    await jest.advanceTimersByTimeAsync(2000 * 30);
    const result = await resultPromise;

    expect(result).toEqual({ ok: true, complete: false });
  });

  it("surfaces an error result if the follow-up poll fails for a real reason", async () => {
    const problemDetails = { type: "Error", title: "Boom", status: 500, detail: "poll failed" };
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ status: "in-progress", taskId: TASK_ID, message: "still going" }) }],
        };
      }
      if (toolName === "get-document-publish-with-descendants-result") {
        return {
          isError: true,
          structuredContent: problemDetails,
          content: [{ type: "text", text: JSON.stringify(problemDetails) }],
        };
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const resultPromise = publishWithDescendants(DOC_ID, PUBLISH_DATA);
    await jest.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
  });

  it("treats a request timeout on a follow-up poll as still-running, not a failure", async () => {
    spy.mockImplementation(async (_server: string, toolName: string) => {
      if (toolName === "publish-document-with-descendants") {
        return {
          isError: false,
          content: [{ type: "text", text: JSON.stringify({ status: "in-progress", taskId: TASK_ID, message: "still going" }) }],
        };
      }
      if (toolName === "get-document-publish-with-descendants-result") {
        throwRequestTimeout();
      }
      throw new Error(`unexpected tool call: ${toolName}`);
    });

    const resultPromise = publishWithDescendants(DOC_ID, PUBLISH_DATA);
    await jest.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result).toEqual({ ok: true, complete: false });
  });
});
