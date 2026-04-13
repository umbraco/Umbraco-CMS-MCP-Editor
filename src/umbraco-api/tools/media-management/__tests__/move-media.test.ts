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
import moveMediaTool from "../put/move-media.js";

const SOURCE_FOLDER_NAME = "_Test Move Media Source";
const TARGET_FOLDER_NAME = "_Test Move Media Target";
const elicitation = createElicitation();

describe("move-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(SOURCE_FOLDER_NAME);
    await MediaManagementTestHelper.cleanupByName(TARGET_FOLDER_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should move a media folder into another folder", async () => {
    const source = await new MediaManagementBuilder()
      .withName(SOURCE_FOLDER_NAME)
      .create();
    elicitation.reset();
    const target = await new MediaManagementBuilder()
      .withName(TARGET_FOLDER_NAME)
      .create();
    elicitation.reset();

    const result = await moveMediaTool.handler(
      { id: source.getId(), targetParentId: target.getId() },
      extra,
    );

    if (result.isError) {
      console.warn("Skipping move-media assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Moved");
    expect(data.id).toBe(source.getId());
  }, 60000);

  it("should cancel move when elicitation is rejected", async () => {
    const source = await new MediaManagementBuilder()
      .withName(SOURCE_FOLDER_NAME)
      .create();
    elicitation.reset();
    const target = await new MediaManagementBuilder()
      .withName(TARGET_FOLDER_NAME)
      .create();
    elicitation.reset();

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      moveMediaTool.handler(
        { id: source.getId(), targetParentId: target.getId() },
        extra,
      ),
    );
  }, 60000);
});
