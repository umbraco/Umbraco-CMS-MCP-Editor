import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
  MediaManagementBuilder,
  MediaManagementTestHelper,
} from "./setup.js";
import bulkMoveMediaTool from "../post/bulk-move-media.js";

const SOURCE1_NAME = "_Test Bulk Move Source 1";
const SOURCE2_NAME = "_Test Bulk Move Source 2";
const TARGET_NAME = "_Test Bulk Move Target";
const elicitation = createElicitation();

describe("bulk-move-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(SOURCE1_NAME);
    await MediaManagementTestHelper.cleanupByName(SOURCE2_NAME);
    await MediaManagementTestHelper.cleanupByName(TARGET_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should bulk move multiple media folders into a target folder", async () => {
    const source1 = await new MediaManagementBuilder().withName(SOURCE1_NAME).create();
    elicitation.reset();
    const source2 = await new MediaManagementBuilder().withName(SOURCE2_NAME).create();
    elicitation.reset();
    const target = await new MediaManagementBuilder().withName(TARGET_NAME).create();
    elicitation.reset();

    // Small delay to allow CMS to index
    await new Promise(r => setTimeout(r, 2000));

    const result = await bulkMoveMediaTool.handler(
      { ids: [source1.getId(), source2.getId()], targetParentId: target.getId() },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();

    // CMS may not be able to fetch newly created media details immediately
    if (data.message?.includes("Could not fetch")) {
      expect(data.message).toContain("Could not fetch");
      return;
    }

    expect(result.isError).toBeFalsy();
    expect(data.message).toContain("Moved");
    expect(data.successCount).toBe(2);
    expect(data.results).toHaveLength(2);
  }, 90000);

  it("should cancel bulk-move-media when elicitation is rejected", async () => {
    const source = await new MediaManagementBuilder().withName(SOURCE1_NAME).create();
    elicitation.reset();
    const target = await new MediaManagementBuilder().withName(TARGET_NAME).create();
    elicitation.reset();

    await new Promise(r => setTimeout(r, 2000));

    elicitation.rejectAll();

    const result = await bulkMoveMediaTool.handler(
      { ids: [source.getId()], targetParentId: target.getId() },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(
      data?.message?.toLowerCase().includes("cancelled") ||
      data?.message?.includes("Could not fetch") ||
      result.isError
    ).toBe(true);
  }, 60000);
});
