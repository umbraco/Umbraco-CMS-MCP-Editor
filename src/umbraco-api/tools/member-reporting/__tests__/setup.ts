export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { MemberReportingTestHelper } from "./helpers/member-reporting-test-helper.js";
export { MemberReportingGroupBuilder } from "./helpers/member-reporting-builder.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import reportMemberCountTool from "../get/report-member-count.js";
import { MemberGroupBuilder } from "../../member-group/__tests__/helpers/member-group-builder.js";
import { MemberGroupTestHelper } from "../../member-group/__tests__/helpers/member-group-test-helper.js";

const TEST_REPORTING_GROUP_NAME = "_Test Reporting Group";

let cachedState: { createdGroupId: string | null } | null = null;

export async function initMemberReportingTestState(
  extra: Parameters<typeof reportMemberCountTool.handler>[1],
): Promise<{ createdGroupId: string | null }> {
  if (cachedState) return cachedState;

  // Verify connectivity
  const countResult = await reportMemberCountTool.handler({}, extra);
  if (countResult.isError) {
    throw new Error("Member reporting: connectivity check failed");
  }

  let createdGroupId: string | null = null;

  // Ensure at least one member group exists — create via CMS directly (no elicitation)
  const groups = await MemberGroupTestHelper.listGroups();
  if (!groups.length) {
    const group = await new MemberGroupBuilder()
      .withName(TEST_REPORTING_GROUP_NAME)
      .create();
    createdGroupId = group.getId();
  }

  cachedState = { createdGroupId };
  return cachedState;
}

export async function cleanupMemberReportingTestState(): Promise<void> {
  if (!cachedState?.createdGroupId) {
    cachedState = null;
    return;
  }
  try {
    const { mcpClientManager } = await import("../../../mcp-client.js");
    await mcpClientManager.callTool("cms", "delete-member-group", {
      id: cachedState.createdGroupId,
    });
  } catch {
    // Best-effort cleanup
  }
  cachedState = null;
}
