import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
  MediaManagementBuilder,
  MediaManagementTestHelper,
} from "./setup.js";
import deleteMediaTool from "../delete/delete-media.js";

const TEST_FOLDER_NAME = "_Test Delete Media";
const elicitation = createElicitation();

describe("delete-media", () => {
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

  it("should delete a media folder (move to recycle bin)", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    const result = await deleteMediaTool.handler({ id: folder.getId() }, extra);

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("recycle bin");
    expect(data.id).toBe(folder.getId());
  }, 30000);

  it("should cancel delete when elicitation is rejected", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      deleteMediaTool.handler({ id: folder.getId() }, extra),
    );
  }, 30000);
});
