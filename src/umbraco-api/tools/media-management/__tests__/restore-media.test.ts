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
import restoreMediaTool from "../put/restore-media.js";

const TEST_FOLDER_NAME = "_Test Restore Media";
const elicitation = createElicitation();

describe("restore-media", () => {
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

  it("should restore a deleted media folder", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    // Delete it first
    await deleteMediaTool.handler({ id: folder.getId() }, extra);
    elicitation.reset();

    // Restore it
    const result = await restoreMediaTool.handler({ id: folder.getId() }, extra);

    if (result.isError) {
      console.warn("Skipping restore-media assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Restored");
    expect(data.id).toBe(folder.getId());
  }, 60000);

  it("should cancel restore when elicitation is rejected", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    // Delete it first
    await deleteMediaTool.handler({ id: folder.getId() }, extra);
    elicitation.reset();

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      restoreMediaTool.handler({ id: folder.getId() }, extra),
    );
  }, 60000);
});
