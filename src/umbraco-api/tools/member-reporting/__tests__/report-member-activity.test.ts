import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import reportMemberActivityTool from "../get/report-member-activity.js";

describe("report-member-activity", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return inactive members for given threshold", async () => {
    const result = await reportMemberActivityTool.handler({ inactiveDays: 90 }, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 60000);
});
