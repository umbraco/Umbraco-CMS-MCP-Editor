import { jest, describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initTagTestState,
} from "./setup.js";

import listTagsTool from "../get/list-tags.js";

// The starter kit used for CI doesn't seed any tagged content, so the
// group-filter scenario has no fixture to exercise. Determine the fixture
// state at module load (top-level await works under --experimental-vm-modules)
// so we can register an EXPLICIT it.skip rather than silently returning.
const preState = await initTagTestState(createMockRequestHandlerExtra());
const filterIt = preState.existingTagGroup ? it : it.skip;

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

  filterIt("should filter tags by group", async () => {
    const result = await listTagsTool.handler({ tagGroup: existingTagGroup! }, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
