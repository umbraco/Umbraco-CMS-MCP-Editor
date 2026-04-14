import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
  MediaManagementTestHelper,
} from "./setup.js";
import createMediaFolderTool from "../post/create-media-folder.js";

const TEST_FOLDER_NAME = "_Test Create Media Folder";
const elicitation = createElicitation();

describe("create-media-folder", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(TEST_FOLDER_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

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

  it("should cancel create when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      createMediaFolderTool.handler(
        { name: "Should Not Be Created", parentId: undefined },
        extra,
      ),
    );
  }, 30000);
});
