/**
 * edit-media Integration Tests
 *
 * Tests for the edit-media PUT tool in the media-management collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  MediaManagementBuilder,
  MediaManagementTestHelper,
  extractChainedResult,
} from "./setup.js";
import editMediaTool from "../put/edit-media.js";
import { mcpClientManager } from "../../../mcp-client.js";

const TEST_IMAGE_NAME = "_Test Edit Media Pixel";
const TEST_IMAGE_RENAME_NAME = "_Test Edit Media Rename";
const RENAMED = "_Test Edit Media Renamed Ok";

describe("edit-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdIds: string[] = [];

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await MediaManagementTestHelper.cleanup(id);
    }
  }, 30000);

  it("sets alt text on an image", async () => {
    const image = await new MediaManagementBuilder()
      .withName(TEST_IMAGE_NAME)
      .asFile()
      .create();
    createdIds.push(image.getId());

    const result = await editMediaTool.handler(
      {
        id: image.getId(),
        name: undefined,
        values: [{ alias: "altText", value: "A transparent test pixel" }],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(image.getId());
    expect(data.updatedFields).toEqual(["altText"]);

    const mediaResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: image.getId() });
    const media = extractChainedResult(mediaResult) as any;
    const alt = media.values?.find((v: any) => v.alias === "altText");
    expect(alt?.value).toBe("A transparent test pixel");
  }, 60000);

  it("renames a media item", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_IMAGE_RENAME_NAME)
      .create();
    createdIds.push(folder.getId());

    const result = await editMediaTool.handler(
      { id: folder.getId(), name: RENAMED, values: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.name).toBe(RENAMED);
    expect(data.updatedFields).toEqual(["name"]);
  }, 60000);

  it("returns an error when no update is requested", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_IMAGE_NAME)
      .create();
    createdIds.push(folder.getId());

    const result = await editMediaTool.handler(
      { id: folder.getId(), name: undefined, values: undefined },
      extra,
    );

    expect(result.isError).toBeTruthy();
  }, 60000);
});
