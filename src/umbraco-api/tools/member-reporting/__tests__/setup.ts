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
import listMemberGroupsTool from "../../member-group/get/list-member-groups.js";
import createMemberGroupTool from "../../member-group/post/create-member-group.js";

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

  // Ensure at least one member group exists
  try {
    const groupsResult = await listMemberGroupsTool.handler({}, extra);
    const groupsData = getStructuredContent(groupsResult) as any;
    if (!groupsData?.items?.length) {
      console.warn("No member groups exist — creating one for reporting tests");
      const createResult = await createMemberGroupTool.handler(
        { name: TEST_REPORTING_GROUP_NAME },
        extra,
      );
      if (!createResult.isError) {
        const createData = getStructuredContent(createResult) as any;
        if (createData?.id) {
          createdGroupId = createData.id;
        }
      }
    }
  } catch {
    // Group creation is best-effort test data setup
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
