import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import {
  MediaManagementBuilder,
  MediaManagementTestHelper,
} from "../../media-management/__tests__/setup.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import {
  ensureReferenceFixture,
  teardownReferenceFixture,
  type ReferenceFixture,
} from "../../content/__tests__/helpers/reference-fixture.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { encodeCursor, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import reportMediaReferencesTool from "../get/report-media-references.js";

const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
const TEST_IMAGE_NAME = "_Test Media Refs Pixel";
const SOURCE_PAGE_NAME = "_Test Refs Source For Media";

describe("report-media-references", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: ReferenceFixture;
  const createdMediaIds: string[] = [];
  const createdPageIds: string[] = [];

  beforeAll(async () => {
    fixture = await ensureReferenceFixture();
  }, 120000);

  afterEach(async () => {
    while (createdPageIds.length > 0) {
      await ContentTestHelper.cleanupById(createdPageIds.pop()!);
    }
    while (createdMediaIds.length > 0) {
      await MediaManagementTestHelper.cleanup(createdMediaIds.pop()!);
    }
  }, 60000);

  afterAll(async () => {
    await teardownReferenceFixture();
  }, 30000);

  it("returns zero references for a freshly created media item", async () => {
    const image = await new MediaManagementBuilder()
      .withName(TEST_IMAGE_NAME)
      .asFile()
      .create();
    createdMediaIds.push(image.getId());

    const result = await reportMediaReferencesTool.handler(
      { id: image.getId() },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.total).toBe(0);
    expect(data.items).toEqual([]);
  }, 60000);

  it("lists a page that references a media item via a media picker", async () => {
    const media = await new MediaManagementBuilder()
      .withName(TEST_IMAGE_NAME + " Target")
      .asFile()
      .create();
    createdMediaIds.push(media.getId());

    const sourceCreate = await mcpClientManager.callTool("cms", "create-document", {
      documentTypeId: fixture.docTypeId,
      name: SOURCE_PAGE_NAME,
      values: [
        {
          editorAlias: "Umbraco.MediaPicker3",
          culture: null,
          segment: null,
          alias: "refMedia",
          value: fixture.buildMediaPickerValue(media.getId()),
        },
      ],
    });
    if (sourceCreate.isError) {
      throw new Error(
        `Failed to create source page: ${JSON.stringify(extractChainedResult(sourceCreate))}`,
      );
    }
    const sourceId = extractChainedResult(sourceCreate).id as string;
    createdPageIds.push(sourceId);

    const result = await reportMediaReferencesTool.handler({ id: media.getId() }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    expect(data.total).toBeGreaterThanOrEqual(1);
    const match = data.items.find((item: any) => item.id === sourceId);
    expect(match).toBeDefined();
    expect(match.kind).toBe("document");
    expect(match.name).toBe(SOURCE_PAGE_NAME);
  }, 120000);

  it("returns an error for a non-existent media ID", async () => {
    const result = await reportMediaReferencesTool.handler(
      { id: NON_EXISTENT_UUID },
      extra,
    );

    expect(result.isError).toBeTruthy();
  }, 30000);

  it("threads pagination through the chained cursor call without error", async () => {
    // Regression: chained call used to pass raw skip/take to get-media-by-id-referenced-by,
    // which expects a cursor. If cursor encoding is wrong the chained call errors.
    const image = await new MediaManagementBuilder()
      .withName(TEST_IMAGE_NAME + " Paged")
      .asFile()
      .create();
    createdMediaIds.push(image.getId());

    const result = await reportMediaReferencesTool.handler(
      { id: image.getId(), cursor: encodeCursor({ s: 0, t: 1 }) },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.items)).toBe(true);
  }, 60000);
});
