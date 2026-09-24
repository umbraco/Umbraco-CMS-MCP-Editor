/**
 * empty-recycle-bin Integration Tests
 *
 * Covers the bulk irreversible wipe:
 *   - both confirmations accepted → bin emptied
 *   - first confirmation declined → bin untouched
 */

import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  RecycleBinBuilder,
  RecycleBinTestHelper,
} from "./setup.js";
import emptyRecycleBinTool from "../delete/empty-recycle-bin.js";
import { withHumanInTheLoopBlocking } from "../../../../testing/human-in-the-loop-test-helper.js";

const TEST_FOLDER_NAME = "_Test Empty RecycleBin";
const elicitation = createElicitation();

describe("empty-recycle-bin", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await RecycleBinTestHelper.cleanupByName("media", TEST_FOLDER_NAME);
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should empty the media recycle bin after both confirmations", async () => {
    await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    const result = await emptyRecycleBinTool.handler(
      { type: "media" },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Emptied");

    const seedGone = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(seedGone).toBeUndefined();
  }, 90000);

  it("should cancel empty-recycle-bin on the first confirmation prompt", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    elicitation.rejectAll();

    const result = await emptyRecycleBinTool.handler(
      { type: "media" },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("cancelled");

    // Seed still present — the decline must not have emptied the bin.
    const stillThere = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(stillThere).toBeDefined();
    expect(stillThere?.id).toBe(trashed.getId());
  }, 60000);

  it("blocks emptying the content recycle bin when the human-in-the-loop gate is enabled, before touching the CMS", async () => {
    await withHumanInTheLoopBlocking(async () => {
      const result = await emptyRecycleBinTool.handler({ type: "content" }, extra);
      expect(result.isError).toBe(true);
      expect(getStructuredContent(result)).toEqual(
        expect.objectContaining({ status: 403, title: expect.stringContaining("blocked") }),
      );
    });
  }, 30000);
});
