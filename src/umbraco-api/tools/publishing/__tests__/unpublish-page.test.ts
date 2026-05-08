import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initPublishingTestState,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import unpublishPageTool from "../post/unpublish-page.js";
import publishPageTool from "../post/publish-page.js";
import { expectUnpublished, expectPublished } from "../../../../testing/state-assertions.js";

const elicitation = createElicitation();

describe("unpublish-page", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initPublishingTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  afterAll(async () => {
    // Re-publish to restore state
    if (testPageId) {
      try {
        elicitation.reset();
        await publishPageTool.handler({ id: testPageId, includeDescendants: false }, extra);
      } catch { /* best-effort */ }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => { elicitation.reset(); });

  it("should unpublish a page", async () => {
    const result = await unpublishPageTool.handler({ id: testPageId }, extra);

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Unpublished");
    expect(data.id).toBe(testPageId);
    expect(data.name).toEqual(expect.any(String));
    await expectUnpublished(testPageId, extra);
  }, 30000);

  it("should re-publish page after unpublish to restore state", async () => {
    const result = await publishPageTool.handler(
      { id: testPageId, includeDescendants: false },
      extra,
    );
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("Published");
    await expectPublished(testPageId, extra);
  }, 30000);

  it("should cancel unpublish when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      unpublishPageTool.handler({ id: testPageId }, extra),
    );
  }, 30000);
});
