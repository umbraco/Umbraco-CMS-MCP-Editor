import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import listMemberGroupsTool from "../get/list-member-groups.js";

describe("list-member-groups", () => {
  setupTestEnvironment();

  it("should list member groups with expected shape", async () => {
    const extra = createMockRequestHandlerExtra();
    const result = await listMemberGroupsTool.handler({}, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("name");
    }
  }, 30000);
});
