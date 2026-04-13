import { jest, describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import { initTagTestState } from "./setup.js";

import listTagsTool from "../get/list-tags.js";

describe("list-tags", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let existingTagGroup: string | null = null;

  beforeAll(async () => {
    const state = await initTagTestState(extra);
    existingTagGroup = state.existingTagGroup;
  }, 60000);

  it("should list all tags across the site", async () => {
    const result = await listTagsTool.handler({ tagGroup: undefined }, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);

  it("should filter tags by group", async () => {
    if (!existingTagGroup) {
      // No tag groups exist on this instance — nothing to filter by
      return;
    }

    const result = await listTagsTool.handler({ tagGroup: existingTagGroup }, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
