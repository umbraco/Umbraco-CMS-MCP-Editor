import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initRelationshipsTestState,
} from "./setup.js";
import reportOutboundLinksTool from "../get/report-outbound-links.js";

describe("report-outbound-links", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initRelationshipsTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should return internalPages, media, and externalUrls arrays", async () => {
    const result = await reportOutboundLinksTool.handler(
      { id: testPageId },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(data.internalPages).toBeInstanceOf(Array);
    expect(data.media).toBeInstanceOf(Array);
    expect(data.externalUrls).toBeInstanceOf(Array);
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.totalLinks).toBe("number");
    expect(typeof data.summary.internalPageCount).toBe("number");
    expect(typeof data.summary.mediaCount).toBe("number");
    expect(typeof data.summary.externalUrlCount).toBe("number");
  }, 60000);
});
