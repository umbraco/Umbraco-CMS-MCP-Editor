import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initMemberTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { MemberBuilder } from "./helpers/member-builder.js";
import { MemberTestHelper } from "./helpers/member-test-helper.js";
import getMemberTool from "../get/get-member.js";

describe("get-member", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let memberId: string;

  beforeAll(async () => {
    const state = await initMemberTestState(extra);
    expect(state.testMemberTypeId).toBeDefined();

    const member = await new MemberBuilder()
      .withEmail("get-test@example.com")
      .withUsername("get-test")
      .withName("_Test Get Member")
      .withMemberType(state.testMemberTypeId!)
      .create();
    memberId = member.getId();
  }, 60000);

  afterAll(async () => {
    if (memberId) await MemberTestHelper.cleanup(memberId);
  }, 30000);

  it("should get a member by ID with full profile", async () => {
    const result = await getMemberTool.handler({ id: memberId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(memberId);
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("email");
    expect(data).toHaveProperty("username");
    expect(data).toHaveProperty("memberType");
    expect(data).toHaveProperty("isApproved");
    expect(data).toHaveProperty("isLockedOut");
    expect(data).toHaveProperty("isTwoFactorEnabled");
    expect(data.groups).toBeInstanceOf(Array);
    expect(data.values).toBeInstanceOf(Array);
  }, 30000);

  it("should return error for non-existent member ID", async () => {
    const result = await getMemberTool.handler({ id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);
});
