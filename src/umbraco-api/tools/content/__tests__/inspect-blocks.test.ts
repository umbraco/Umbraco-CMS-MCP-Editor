import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
  extractChainedResult,
  getStructuredContent,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import inspectBlocksTool from "../get/inspect-blocks.js";

describe("inspect-blocks", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPage: ContentBuilder | null = null;
  let testPageId: string;

  beforeAll(async () => {
    const state = await initContentTestState(extra);

    // Discover a donor child page that already has a non-empty BlockList property.
    // This gives us a doc type, property alias, and element type that are
    // known-valid on this Umbraco instance, plus a sample block whose property
    // alias we can reuse for the fixture (so we get a real round-trip including
    // a property *value* in the snapshot, not just structural fields).
    const children = await ContentTestHelper.getChildren(state.testPageId, 20);
    let donorDocTypeId: string | null = null;
    let propertyAlias: string | null = null;
    let elementTypeId: string | null = null;
    let blockPropertyAlias: string | null = null;

    for (const child of children) {
      const inspectResult = await inspectBlocksTool.handler(
        { id: child.id, propertyAlias: undefined },
        extra,
      );
      const data = getStructuredContent(inspectResult) as any;
      const prop = data?.blockProperties?.find(
        (p: any) => p.editorAlias === "Umbraco.BlockList" && p.blocks?.length,
      );
      if (!prop) continue;

      // Find a block on the donor that has at least one string-valued property
      // we can copy the alias of (to use in our fixture). String values are the
      // safest — block-of-blocks or media-picker values would pull in nested
      // chrome we don't want in the snapshot.
      const blockWithStringValue = prop.blocks.find((b: any) =>
        Array.isArray(b.properties)
        && b.properties.some((p: any) => typeof p.value === "string"),
      );
      if (!blockWithStringValue) continue;
      const stringProp = blockWithStringValue.properties.find((p: any) => typeof p.value === "string");

      const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: child.id });
      if (docResult.isError) continue;
      const doc = extractChainedResult(docResult);
      if (!doc?.documentType?.id) continue;

      donorDocTypeId = doc.documentType.id;
      propertyAlias = prop.propertyAlias;
      elementTypeId = blockWithStringValue.contentTypeKey;
      blockPropertyAlias = stringProp.alias;
      break;
    }

    if (!donorDocTypeId || !propertyAlias || !elementTypeId || !blockPropertyAlias) {
      throw new Error("No donor page with a BlockList block containing a string property found under root — cannot derive deterministic test fixture");
    }

    const blockKey = "11111111-1111-4111-8111-111111111111";
    const KNOWN_PROPERTY_VALUE = "_audit fixture block value";

    const blockListValue = {
      contentData: [
        {
          key: blockKey,
          contentTypeKey: elementTypeId,
          values: [
            { alias: blockPropertyAlias, value: KNOWN_PROPERTY_VALUE, culture: null, segment: null },
          ],
        },
      ],
      settingsData: [],
      layout: { "Umbraco.BlockList": [{ contentKey: blockKey }] },
      expose: [{ contentKey: blockKey, culture: null, segment: null }],
    };

    testPage = await new ContentBuilder()
      .withName("_Test inspect-blocks deterministic")
      .withDocumentType(donorDocTypeId)
      .withParent(state.testPageId)
      .withValue(propertyAlias, blockListValue)
      .create();
    testPageId = testPage.getId();
  }, 120000);

  afterAll(async () => {
    if (testPage) {
      await ContentTestHelper.cleanupById(testPage.getId());
    }
  }, 30000);

  it("should return block structure for a page", async () => {
    const result = await inspectBlocksTool.handler(
      { id: testPageId, propertyAlias: undefined },
      extra,
    );

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);
});
