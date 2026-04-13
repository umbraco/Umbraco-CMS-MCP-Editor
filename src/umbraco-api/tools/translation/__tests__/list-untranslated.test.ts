import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initTranslationTestState,
} from "./setup.js";
import listUntranslatedTool from "../get/list-untranslated.js";

describe("list-untranslated", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let multiLanguage: boolean;
  let secondaryCulture: string;

  beforeAll(async () => {
    const state = await initTranslationTestState(extra);
    multiLanguage = state.multiLanguage;
    secondaryCulture = state.secondaryCulture;
  }, 60000);

  it("should list pages missing a culture variant", async () => {
    if (!multiLanguage) {
      console.warn("Skipping: requires multi-language Umbraco site");
      return;
    }

    const result = await listUntranslatedTool.handler(
      { culture: secondaryCulture, parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.items.length > 0) {
      expect(data.items[0]).toHaveProperty("id");
      expect(data.items[0]).toHaveProperty("name");
      expect(data.items[0]).toHaveProperty("availableCultures");
      expect(data.items[0].availableCultures).toBeInstanceOf(Array);
    }
  }, 60000);
});
