import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import getPropertyValueTemplateTool from "../get/get-property-value-template.js";

describe("get-property-value-template", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("lists available editors when called without an alias", async () => {
    const result = await getPropertyValueTemplateTool.handler({ editorAlias: undefined }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    // Free-text response — sanity-check it mentions a few well-known editors.
    expect(typeof data.message).toBe("string");
    expect(data.message).toMatch(/BlockList/i);
    expect(data.message).toMatch(/MediaPicker3|TextBox/i);
    expect(data.editorAlias).toBeUndefined();
  }, 30000);

  it("returns the value-shape template for a specific editor alias", async () => {
    const result = await getPropertyValueTemplateTool.handler({ editorAlias: "Umbraco.MediaPicker3" }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.editorAlias).toBe("Umbraco.MediaPicker3");
    expect(data.message).toMatch(/mediaKey|key/);
  }, 30000);

  it("returns an error result for an unknown editor alias", async () => {
    const result = await getPropertyValueTemplateTool.handler({ editorAlias: "Umbraco.DoesNotExistXYZ" }, extra);
    expect(result.isError).toBe(true);
  }, 30000);
});
