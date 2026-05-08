import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initLanguageTestState,
} from "./setup.js";
import getLanguageTool from "../get/get-language.js";

describe("get-language", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let defaultIsoCode: string;

  beforeAll(async () => {
    const state = await initLanguageTestState(extra);
    defaultIsoCode = state.defaultIsoCode;
  }, 60000);

  it("should get default language details by ISO code", async () => {
    const result = await getLanguageTool.handler({ isoCode: defaultIsoCode }, extra);

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);

  it("should return error for invalid ISO code", async () => {
    const result = await getLanguageTool.handler({ isoCode: "xx-INVALID" }, extra);

    expect(result.isError).toBeTruthy();
  }, 30000);
});
