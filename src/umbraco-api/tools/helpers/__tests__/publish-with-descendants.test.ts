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

describe("parsePublishWithDescendantsStatus", () => {
  it("treats the empty-string success payload as complete", () => {
    expect(parsePublishWithDescendantsStatus("")).toEqual({ complete: true });
  });

  it("treats an unrelated object as complete", () => {
    expect(parsePublishWithDescendantsStatus({ foo: "bar" })).toEqual({ complete: true });
  });

  it("parses the in-progress payload", () => {
    expect(
      parsePublishWithDescendantsStatus({ status: "in-progress", taskId: TASK_ID, message: "still going" }),
    ).toEqual({ complete: false, taskId: TASK_ID });
  });

  it("ignores status in-progress without a string taskId", () => {
    expect(parsePublishWithDescendantsStatus({ status: "in-progress" })).toEqual({ complete: true });
  });
});

describe("publishWithDescendants", () => {
  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    spy = jest.spyOn(mcpClientManager, "callTool");
    jest.useFakeTimers();
  });

  afterEach(() => {
    spy.mockRestore();
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

    expect(result).toEqual({ ok: true, complete: false, taskId: TASK_ID });
  });

  it("surfaces an error result if the follow-up poll fails", async () => {
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
});
