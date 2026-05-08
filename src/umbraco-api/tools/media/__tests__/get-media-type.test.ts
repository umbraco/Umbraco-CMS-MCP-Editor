import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createSnapshotResult,
} from "./setup.js";
import getMediaTypeTool from "../get/get-media-type.js";
import listMediaTypesTool from "../get/list-media-types.js";

const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

describe("get-media-type", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("returns the property schema for a media type", async () => {
    const listResult = await listMediaTypesTool.handler({ parentId: undefined }, extra);
    const listData = getStructuredContent(listResult) as any;
    const image = listData.items.find((t: any) => t.name === "Image");
    expect(image).toBeDefined();

    const result = await getMediaTypeTool.handler({ id: image.id }, extra);
    expect(createSnapshotResult(result, image.id)).toMatchSnapshot();
  }, 30000);

  it("returns an error for a non-existent media type", async () => {
    const result = await getMediaTypeTool.handler({ id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);
});
