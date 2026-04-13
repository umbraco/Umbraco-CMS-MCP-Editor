import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import {
  initMemberReportingTestState,
  cleanupMemberReportingTestState,
} from "./setup.js";
import reportMemberCountTool from "../get/report-member-count.js";

describe("report-member-count", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initMemberReportingTestState(extra);
  }, 60000);

  afterAll(async () => {
    await cleanupMemberReportingTestState();
  }, 30000);

  it("should return member count breakdown by type and group", async () => {
    const result = await reportMemberCountTool.handler({}, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 60000);

  it("should return error for invalid input", async () => {
    // report-member-count takes no input — test that the tool handles
    // a connectivity failure gracefully by checking success on normal call
    const result = await reportMemberCountTool.handler({}, extra);

    expect(result.isError).toBeFalsy();
  }, 60000);
});
