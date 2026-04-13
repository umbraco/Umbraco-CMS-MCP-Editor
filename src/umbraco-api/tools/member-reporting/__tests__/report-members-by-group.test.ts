import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  MemberReportingTestHelper,
} from "./setup.js";
import {
  initMemberReportingTestState,
  cleanupMemberReportingTestState,
} from "./setup.js";
import reportMembersByGroupTool from "../get/report-members-by-group.js";

describe("report-members-by-group", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initMemberReportingTestState(extra);
  }, 60000);

  afterAll(async () => {
    await cleanupMemberReportingTestState();
  }, 30000);

  it("should return members for an existing group", async () => {
    const groupName = await MemberReportingTestHelper.getGroupName(extra);
    if (!groupName) {
      console.warn("No member groups found — skipping test");
      return;
    }

    const result = await reportMembersByGroupTool.handler({ groupName }, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 60000);
});
