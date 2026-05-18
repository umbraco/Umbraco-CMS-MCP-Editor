import { describe, it, expect, afterAll, afterEach, beforeAll } from "@jest/globals";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  MediaManagementTestHelper,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import uploadMediaTool from "../post/upload-media.js";

const UPLOAD_FROM_URL_NAME = "_Test Upload Media From URL";
// Minimal 1x1 transparent PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TINY_PNG_BUFFER = Buffer.from(TINY_PNG_BASE64, "base64");

describe("upload-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  let server: Server;
  let serverUrl: string;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": String(TINY_PNG_BUFFER.length) });
      res.end(TINY_PNG_BUFFER);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    serverUrl = `http://127.0.0.1:${port}/tiny.png`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(UPLOAD_FROM_URL_NAME);
  }, 30000);

  it("should upload an image from a remote URL to the root of the media library", async () => {
    const result = await callTool(
      uploadMediaTool,
      { sourceType: "url", fileUrl: serverUrl, name: UPLOAD_FROM_URL_NAME, mediaTypeName: "Image" },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as { message: string; name: string; id: string };
    expect(data).toBeDefined();
    expect(data.name).toBe(UPLOAD_FROM_URL_NAME);
    expect(data.id).toBeTruthy();
  }, 60000);
});
