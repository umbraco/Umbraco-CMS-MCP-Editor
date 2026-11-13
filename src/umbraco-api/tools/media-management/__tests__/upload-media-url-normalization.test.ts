/**
 * Verifies upload-media normalizes recognisable Google Drive share/view/uc
 * URLs to their direct-download form before handing fileUrl to the chained
 * `create-media` tool.
 *
 * This server never fetches fileUrl itself — chainCms delegates the actual
 * HTTP request to the chained CMS tool via mcpClientManager.callTool — so we
 * spy on that boundary (same pattern as cms-chain.test.ts) rather than
 * exercising this against a live Umbraco instance. That keeps this test pure
 * (no Umbraco / network dependency) while still proving the normalization is
 * wired into the real tool handler (including its withStandardDecorators
 * wrapping), not just the helper function in isolation.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { setupTestEnvironment, createMockRequestHandlerExtra } from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";
import uploadMediaTool from "../post/upload-media.js";

describe("upload-media URL normalization", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    spy = jest.spyOn(mcpClientManager, "callTool").mockResolvedValue({
      isError: false,
      structuredContent: { message: "Media created", name: "test", id: "00000000-0000-0000-0000-000000000000" },
      content: [{ type: "text", text: "Media created" }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("rewrites a Drive share/view link before calling the chained create-media tool", async () => {
    await callTool(
      uploadMediaTool,
      {
        sourceType: "url",
        fileUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing",
        name: "Drive Upload",
        mediaTypeName: "Image",
      },
      extra,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      "cms",
      "create-media",
      expect.objectContaining({
        fileUrl: "https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOpQrSt&export=download",
      }),
    );
  });

  it("passes a non-Drive URL through unchanged", async () => {
    await callTool(
      uploadMediaTool,
      {
        sourceType: "url",
        fileUrl: "https://example.com/file.png",
        name: "Regular Upload",
        mediaTypeName: "Image",
      },
      extra,
    );

    expect(spy).toHaveBeenCalledWith(
      "cms",
      "create-media",
      expect.objectContaining({ fileUrl: "https://example.com/file.png" }),
    );
  });

  it("does not add a fileUrl when uploading via base64", async () => {
    await callTool(
      uploadMediaTool,
      {
        sourceType: "base64",
        fileAsBase64: "aGVsbG8=",
        name: "Base64 Upload",
        mediaTypeName: "Image",
      },
      extra,
    );

    const callArgs = spy.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(callArgs.fileUrl).toBeUndefined();
  });
});
