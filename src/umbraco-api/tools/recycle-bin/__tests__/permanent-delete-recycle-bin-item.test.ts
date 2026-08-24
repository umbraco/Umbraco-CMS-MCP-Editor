/**
 * permanent-delete-recycle-bin-item Integration Tests
 *
 * Covers the irreversible single-item delete flow:
 *   - leaf (no descendants)
 *   - cascade (trashed folder with a nested child)
 *   - cancelled via elicitation rejection
 */

import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
  RecycleBinBuilder,
  RecycleBinTestHelper,
} from "./setup.js";
import permanentDeleteTool from "../delete/permanent-delete-recycle-bin-item.js";
import { withHumanInTheLoopBlocking } from "../../../../testing/human-in-the-loop-test-helper.js";

const TEST_FOLDER_NAME = "_Test PermDelete RecycleBin";
const CHILD_FOLDER_NAME = "_Test PermDelete RecycleBin Child";
const elicitation = createElicitation();

describe("permanent-delete-recycle-bin-item", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await RecycleBinTestHelper.cleanupByName("media", TEST_FOLDER_NAME);
    await RecycleBinTestHelper.cleanupByName("media", CHILD_FOLDER_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should permanently delete a trashed leaf folder", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    const result = await permanentDeleteTool.handler(
      { id: trashed.getId(), type: "media" },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("Permanently deleted");
    expect(data.id).toBe(trashed.getId());

    const stillThere = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(stillThere).toBeUndefined();
  }, 60000);

  it("should permanently delete a trashed folder and cascade its descendants", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .withNestedChild(CHILD_FOLDER_NAME)
      .create();

    const result = await permanentDeleteTool.handler(
      { id: trashed.getId(), type: "media" },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("Permanently deleted");
    expect(data.id).toBe(trashed.getId());
    expect(data.descendantCount).toBeGreaterThanOrEqual(1);

    const parentGone = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(parentGone).toBeUndefined();
    const childGone = await RecycleBinTestHelper.findInBin("media", CHILD_FOLDER_NAME);
    expect(childGone).toBeUndefined();
  }, 90000);

  it("should cancel permanent delete when elicitation is rejected", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      permanentDeleteTool.handler({ id: trashed.getId(), type: "media" }, extra),
    );

    // The item should still be in the bin because the delete was cancelled.
    const stillThere = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(stillThere).toBeDefined();
  }, 60000);

  it("blocks permanent delete of content when the human-in-the-loop gate is enabled, before touching the CMS", async () => {
    await withHumanInTheLoopBlocking(async () => {
      const result = await permanentDeleteTool.handler(
        { id: "00000000-0000-0000-0000-000000000000", type: "content" },
        extra,
      );
      expect(result.isError).toBe(true);
      expect(getStructuredContent(result)).toEqual(
        expect.objectContaining({ status: 403, title: expect.stringContaining("blocked") }),
      );
    });
  }, 30000);

  it("does not gate media even when the human-in-the-loop gate is enabled", async () => {
    await withHumanInTheLoopBlocking(async () => {
      const result = await permanentDeleteTool.handler(
        { id: "00000000-0000-0000-0000-000000000000", type: "media" },
        extra,
      );
      // Out of scope for now — falls through to the real lookup, which fails
      // with a not-found error rather than the gate's 403.
      expect(result.isError).toBe(true);
      const data = getStructuredContent(result) as any;
      expect(data?.title).not.toContain("blocked");
    });
  }, 30000);
});
