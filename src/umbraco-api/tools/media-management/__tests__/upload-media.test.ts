import { describe, it, expect, afterAll, afterEach, beforeAll } from "@jest/globals";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  MediaManagementTestHelper,
} from "./setup.js";
import uploadMediaTool from "../post/upload-media.js";

const UPLOAD_NAME = "_Test Upload Media File";
// Minimal 1x1 transparent PNG
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("upload-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  let tmpDir: string;
  let tmpFilePath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "upload-media-test-"));
    tmpFilePath = join(tmpDir, "tiny.png");
    writeFileSync(tmpFilePath, Buffer.from(TINY_PNG_BASE64, "base64"));
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(UPLOAD_NAME);
  }, 30000);

  it("should upload a local image file to the root of the media library", async () => {
    const result = await uploadMediaTool.handler(
      { filePath: tmpFilePath, name: UPLOAD_NAME, parentId: undefined, mediaTypeName: "Image" },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Uploaded");
    expect(data.name).toBe(UPLOAD_NAME);
    expect(data.id).toBeTruthy();
  }, 60000);
});
