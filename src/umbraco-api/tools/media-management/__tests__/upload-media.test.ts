import { describe, it, expect, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import uploadMediaTool from "../post/upload-media.js";

const elicitation = createElicitation();

describe("upload-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    elicitation.cleanup();
  });

  beforeEach(() => {
    elicitation.reset();
  });

  it("should cancel upload when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      uploadMediaTool.handler(
        { filePath: "/tmp/test-image.jpg", name: "Should Not Upload", parentId: undefined, mediaTypeId: undefined },
        extra,
      ),
    );
  }, 30000);
});
