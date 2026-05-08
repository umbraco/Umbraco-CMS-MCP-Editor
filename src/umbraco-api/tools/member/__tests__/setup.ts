/**
 * Member Collection Test Setup
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listMemberTypesTool from "../get/list-member-types.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
export const TEST_MEMBER_EMAIL = "test-integration@example.com";
export const TEST_MEMBER_USERNAME = "test-integration";
export const TEST_MEMBER_NAME = "Integration Test Member";
export const TEST_MEMBER_PASSWORD = "TestPass123!";
export const TEST_MEMBER_UPDATED_NAME = "Integration Test Member Updated";

interface MemberTestState {
  testMemberTypeId: string | undefined;
}

let cachedState: MemberTestState | null = null;

export async function initMemberTestState(
  extra: Parameters<typeof listMemberTypesTool.handler>[1],
): Promise<MemberTestState> {
  if (cachedState) return cachedState;

  const result = await listMemberTypesTool.handler({}, extra);
  if (result.isError) throw new Error("Failed to list member types");

  const data = getStructuredContent(result) as any;
  const testMemberTypeId = data?.items?.[0]?.id;

  cachedState = { testMemberTypeId };
  return cachedState;
}

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
