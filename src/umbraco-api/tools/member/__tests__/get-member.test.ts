import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  NON_EXISTENT_UUID,
} from "./setup.js";
import getMemberTool from "../get/get-member.js";
import searchMembersTool from "../get/search-members.js";

describe("get-member", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should get a member by ID with full profile", async () => {
    // Find an existing member
    let memberId: string | undefined;
    for (const query of ["test", "admin", "a"]) {
      const searchResult = await searchMembersTool.handler({ query }, extra);
      const data = getStructuredContent(searchResult) as any;
      if (data?.items?.length > 0) {
        memberId = data.items[0].id;
        break;
      }
    }

    const result = await getMemberTool.handler({ id: memberId! }, extra);

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
