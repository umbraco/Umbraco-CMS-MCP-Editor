import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initLanguageTestState,
} from "./setup.js";
import listLanguagesTool from "../get/list-languages.js";

describe("list-languages", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initLanguageTestState(extra);
  }, 60000);

  it("should list all configured languages", async () => {
    const result = await listLanguagesTool.handler({}, extra);

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
