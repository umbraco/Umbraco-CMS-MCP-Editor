import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import listScheduledContentTool from "../get/list-scheduled-content.js";

describe("list-scheduled-content", () => {
  setupTestEnvironment();

  it("should scan root and return structured result (may be empty)", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await listScheduledContentTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));
    expect(data.scannedPages).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("name");
      expect(data.items[0]).toHaveProperty("scheduledPublishDate");
      expect(data.items[0]).toHaveProperty("scheduledUnpublishDate");
    }
  }, 60000);
});
