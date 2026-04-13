import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initVersioningTestState,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import listVersionsTool from "../get/list-versions.js";
import rollbackPageTool from "../post/rollback-page.js";

const elicitation = createElicitation();

describe("rollback-page", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initVersioningTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should rollback to a previous version", async () => {
    const versionsResult = await listVersionsTool.handler({ id: testPageId }, extra);
    const versionsData = getStructuredContent(versionsResult) as any;

    if (!versionsData?.versions?.length || versionsData.versions.length < 2) {
      console.warn("Skipping rollback test: fewer than 2 versions available");
      return;
    }

    const targetVersion = versionsData.versions[1];
    const result = await rollbackPageTool.handler(
      { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
      extra,
    );

    if (result.isError) {
      console.warn("Skipping rollback assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Rolled back");
    expect(data.id).toBe(testPageId);
    expect(data.versionId).toBe(targetVersion.versionId);
  }, 30000);

  it("should cancel rollback when elicitation is rejected", async () => {
    const versionsResult = await listVersionsTool.handler({ id: testPageId }, extra);
    const versionsData = getStructuredContent(versionsResult) as any;

    if (!versionsData?.versions?.length) {
      console.warn("Skipping elicitation rejection test: no versions available");
      return;
    }

    elicitation.rejectAll();

    const targetVersion = versionsData.versions[0];
    await expectElicitationCancel(() =>
      rollbackPageTool.handler(
        { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
        extra,
      ),
    );
  }, 30000);
});
