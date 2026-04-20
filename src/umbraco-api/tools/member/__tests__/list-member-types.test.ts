import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import listMemberTypesTool from "../get/list-member-types.js";

describe("list-member-types", () => {
  setupTestEnvironment();

  it("should list available member types", async () => {
    const extra = createMockRequestHandlerExtra();
    const result = await listMemberTypesTool.handler({}, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("alias");
      expect(data.items[0]).toHaveProperty("name");
    }
  }, 30000);
});
