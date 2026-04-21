import { describe, it, expect, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  MediaManagementTestHelper,
} from "./setup.js";
import createMediaFolderTool from "../post/create-media-folder.js";

const TEST_FOLDER_NAME = "_Test Create Media Folder";

describe("create-media-folder", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(TEST_FOLDER_NAME);
  }, 30000);

  it("should create a media folder", async () => {
    const result = await createMediaFolderTool.handler(
      { name: TEST_FOLDER_NAME, parentId: undefined },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Created");
    expect(data.name).toBe(TEST_FOLDER_NAME);
  }, 30000);
});
