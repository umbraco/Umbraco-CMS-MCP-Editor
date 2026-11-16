import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { z } from "zod";
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
import { callTool } from "../../../../testing/call-tool-with-validation.js";

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

  // Regression coverage for issue #307: the confirmation prompt resolves the
  // target version's author via get-user-by-id, now gated behind a Users-
  // section access check (checkUsersAccess). The API user these integration
  // tests authenticate as is a full admin, so it always has that access —
  // this exercises the unchanged happy path only. The "no Users access →
  // raw ID, no get-user-by-id call" branch can't be forced against a real
  // admin user and is covered instead by the mocked unit tests in
  // helpers/__tests__/users-access.test.ts.
  it("should rollback to a previous version", async () => {
    const versionsResult = await callTool(listVersionsTool, { id: testPageId }, extra);
    const versionsData = getStructuredContent(versionsResult) as any;

    if (!versionsData?.versions?.length || versionsData.versions.length < 2) {    }

    const targetVersion = versionsData.versions[1];
    const result = await callTool(
      rollbackPageTool,
      { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Rolled back");
    expect(data.id).toBe(testPageId);
    expect(data.versionId).toBe(targetVersion.versionId);
  }, 30000);

  it("input schema accepts Umbraco sequential GUID versionId format", async () => {
    // Umbraco emits version IDs like "000005e3-0000-0000-0000-000000000000" —
    // permissive GUIDs without RFC 4122 version/variant nibbles. rollback-page's
    // schema must use z.guid() not z.uuid() to accept them.
    const inputSchema = z.object({
      id: rollbackPageTool.inputSchema!.id,
      versionId: rollbackPageTool.inputSchema!.versionId,
      culture: rollbackPageTool.inputSchema!.culture,
    });

    const sampleVersionId = "000005e3-0000-0000-0000-000000000000";
    const result = inputSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      versionId: sampleVersionId,
    });
    expect(result.success).toBe(true);
  });

  it("input schema rejects non-GUID-shaped versionId", () => {
    const inputSchema = z.object({
      id: rollbackPageTool.inputSchema!.id,
      versionId: rollbackPageTool.inputSchema!.versionId,
      culture: rollbackPageTool.inputSchema!.culture,
    });

    const result = inputSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      versionId: "not-a-guid",
    });
    expect(result.success).toBe(false);
  });

  it("should cancel rollback when elicitation is rejected", async () => {
    const versionsResult = await callTool(listVersionsTool, { id: testPageId }, extra);
    const versionsData = getStructuredContent(versionsResult) as any;

    elicitation.rejectAll();

    const targetVersion = versionsData.versions[0];
    await expectElicitationCancel(() =>
      callTool(
        rollbackPageTool,
        { id: testPageId, versionId: targetVersion.versionId, culture: undefined },
        extra,
      ),
    );
  }, 30000);
});
