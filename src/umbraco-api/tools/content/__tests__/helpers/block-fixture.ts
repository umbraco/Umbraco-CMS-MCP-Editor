/**
 * Block fixture helpers — discover a donor page on the live Umbraco instance
 * that already has a non-empty block-bearing property, extract a known-valid
 * doc type / property alias / element type / inner property alias from it,
 * then create a deterministic test page with seeded block content for the
 * add-block-* tools to operate on.
 *
 * Discovery (rather than hardcoded IDs) keeps the fixture portable across
 * Umbraco instances; the deterministic-page step keeps the assertions
 * independent of whatever live data happens to be there.
 *
 * The Clean starter kit only ships BlockList content out of the box, so the
 * BlockGrid and RTE-with-blocks fixtures fall through to an idempotent
 * provisioning step when no natural donor is found — they create their own
 * element type / data type / doc type / donor page via the chained CMS dev
 * MCP. This keeps the test suite green on a stock demo and gives BlockGrid
 * and RTE the same level of coverage as BlockList.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { ContentBuilder } from "./content-builder.js";
import { ContentTestHelper } from "./content-test-helper.js";
import inspectBlocksTool from "../../get/inspect-blocks.js";
import { initContentTestState } from "../setup.js";

interface DonorInfo {
  donorDocTypeId: string;
  propertyAlias: string;
  elementTypeId: string;
  blockPropertyAlias: string;
  /** Set when the donor's BlockList layout contains an entry with settingsKey */
  settings?: {
    settingsElementTypeId: string;
    /** A property alias inside the settings element type with a string value */
    settingsPropertyAlias: string;
  };
}

type Editor = "Umbraco.BlockList" | "Umbraco.BlockGrid" | "Umbraco.RichText";

async function findDonor(editorAlias: Editor, extra: any): Promise<DonorInfo | null> {
  const state = await initContentTestState(extra);
  const children = await ContentTestHelper.getChildren(state.testPageId, 30);
  const candidates = [{ id: state.testPageId }, ...children];

  for (const candidate of candidates) {
    const inspect = await inspectBlocksTool.handler({ id: candidate.id, propertyAlias: undefined }, extra);
    const data = getStructuredContent(inspect) as any;
    const prop = data?.blockProperties?.find((p: any) => p.editorAlias === editorAlias && p.blocks?.length);
    if (!prop) continue;

    const blockWithStringValue = prop.blocks.find((b: any) =>
      Array.isArray(b.properties)
      && b.properties.some((p: any) => typeof p.value === "string"),
    );
    if (!blockWithStringValue) continue;
    const stringProp = blockWithStringValue.properties.find((p: any) => typeof p.value === "string");

    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: candidate.id });
    if (docResult.isError) continue;
    const doc = extractChainedResult(docResult);
    if (!doc?.documentType?.id) continue;

    // Settings discovery: look at the donor's raw value to find any layout
    // entry with a settingsKey, then map back to its settingsData entry to
    // pick up the settings element type. If found, find a string-valued
    // property alias inside it for tests that need to roundtrip a value.
    let settings: DonorInfo["settings"];
    if (editorAlias === "Umbraco.BlockList") {
      const propValue = (doc.values ?? []).find((v: any) => v.alias === prop.propertyAlias)?.value;
      const layout = propValue?.layout?.["Umbraco.BlockList"] ?? [];
      const entryWithSettings = layout.find((l: any) => typeof l?.settingsKey === "string" && l.settingsKey.length > 0);
      if (entryWithSettings) {
        const settingsEntry = (propValue?.settingsData ?? []).find((s: any) => s.key === entryWithSettings.settingsKey);
        const stringSettingsProp = (settingsEntry?.values ?? []).find((p: any) => typeof p.value === "string");
        if (settingsEntry?.contentTypeKey && stringSettingsProp) {
          settings = {
            settingsElementTypeId: settingsEntry.contentTypeKey,
            settingsPropertyAlias: stringSettingsProp.alias,
          };
        }
      }
    }

    return {
      donorDocTypeId: doc.documentType.id,
      propertyAlias: prop.propertyAlias,
      elementTypeId: blockWithStringValue.contentTypeKey,
      blockPropertyAlias: stringProp.alias,
      settings,
    };
  }
  return null;
}

export interface BlockListFixture extends DonorInfo {
  page: ContentBuilder;
  pageId: string;
  /** The seeded block's contentKey, useful for before/after positions */
  seededBlockKey: string;
  /** Set when seedSettings: true was passed AND the donor exposed settings info */
  seededSettingsKey?: string;
  cleanup(): Promise<void>;
}

const SEEDED_BLOCK_KEY = "11111111-1111-4111-8111-111111111111";
const SEEDED_SETTINGS_KEY = "22222222-2222-4222-8222-222222222222";
const SEEDED_VALUE = "_seeded block value";
const SEEDED_SETTINGS_VALUE = "_seeded settings value";

const PROVISIONED_TEXTBOX_NAME = "_Audit textbox";
const PROVISIONED_ELEMENT_ALIAS = "_auditBlockElement";
const PROVISIONED_ELEMENT_NAME = "_Audit block element";
const PROVISIONED_BLOCKGRID_NAME = "_Audit blockgrid";
const PROVISIONED_RTE_NAME = "_Audit rte with blocks";
const PROVISIONED_DOCTYPE_ALIAS = "_auditBlockHost";
const PROVISIONED_DOCTYPE_NAME = "_Audit block host";

interface ProvisionedDonor {
  donorDocTypeId: string;
  propertyAlias: string;
  elementTypeId: string;
  blockPropertyAlias: string;
}

/**
 * Idempotently provision a doc type with a BlockGrid property and an RTE
 * (Tiptap with `Umb.Tiptap.Block`) property, both backed by a TextBox-bearing
 * element type. Returns the per-editor donor info — the same shape as
 * findDonor — and a cleanup callback for the doc type's data types and
 * element type. The caller is responsible for cleaning up created pages.
 */
async function provisionBlockGridAndRteDonors(): Promise<{
  blockGrid: ProvisionedDonor;
  rte: ProvisionedDonor;
  docTypeId: string;
} | null> {
  // 1 — TextBox datatype
  const findTextbox = await mcpClientManager.callTool("cms", "find-data-type", { name: PROVISIONED_TEXTBOX_NAME });
  if (findTextbox.isError) return null;
  const textboxItems = (extractChainedResult(findTextbox)?.items ?? []) as Array<{ id: string; name: string }>;
  let textboxId = textboxItems.find(d => d.name === PROVISIONED_TEXTBOX_NAME)?.id;
  if (!textboxId) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name: PROVISIONED_TEXTBOX_NAME,
      editorAlias: "Umbraco.TextBox",
      editorUiAlias: "Umb.PropertyEditorUi.TextBox",
      values: [{ alias: "maxChars", value: 200 }],
    });
    if (created.isError) return null;
    textboxId = extractChainedResult(created)?.id;
  }
  if (!textboxId) return null;

  // 2 — Element type with one TextBox "title" property. create-element-type
  // errors on duplicate alias; on conflict, look the existing one up via
  // get-all-document-types (element types share that listing).
  let elementTypeId: string | undefined;
  const createdElement = await mcpClientManager.callTool("cms", "create-element-type", {
    name: PROVISIONED_ELEMENT_NAME,
    alias: PROVISIONED_ELEMENT_ALIAS,
    icon: "icon-block",
    compositions: [],
    properties: [{ name: "Title", alias: "title", dataTypeId: textboxId, group: "Content" }],
  });
  if (!createdElement.isError) {
    elementTypeId = extractChainedResult(createdElement)?.id;
  } else {
    const allDocTypes = await mcpClientManager.callTool("cms", "get-all-document-types", {});
    const items = (extractChainedResult(allDocTypes)?.items ?? []) as Array<{ id: string; alias: string }>;
    elementTypeId = items.find(d => d.alias === PROVISIONED_ELEMENT_ALIAS)?.id;
  }
  if (!elementTypeId) return null;

  // 3 — BlockGrid datatype configured with the element type
  const findGridDt = await mcpClientManager.callTool("cms", "find-data-type", { name: PROVISIONED_BLOCKGRID_NAME });
  let blockGridDtId = (extractChainedResult(findGridDt)?.items ?? []).find((d: any) => d.name === PROVISIONED_BLOCKGRID_NAME)?.id;
  if (!blockGridDtId) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name: PROVISIONED_BLOCKGRID_NAME,
      editorAlias: "Umbraco.BlockGrid",
      editorUiAlias: "Umb.PropertyEditorUi.BlockGrid",
      values: [
        { alias: "gridColumns", value: 12 },
        { alias: "blocks", value: [{
          contentElementTypeKey: elementTypeId,
          allowAtRoot: true,
          allowInAreas: true,
          columnSpanOptions: [{ columnSpan: 12 }],
          rowMinSpan: 1,
          rowMaxSpan: 1,
        }] },
      ],
    });
    if (created.isError) return null;
    blockGridDtId = extractChainedResult(created)?.id;
  }
  if (!blockGridDtId) return null;

  // 4 — RTE (Tiptap) datatype with the block extension wired up
  const findRteDt = await mcpClientManager.callTool("cms", "find-data-type", { name: PROVISIONED_RTE_NAME });
  let rteDtId = (extractChainedResult(findRteDt)?.items ?? []).find((d: any) => d.name === PROVISIONED_RTE_NAME)?.id;
  if (!rteDtId) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name: PROVISIONED_RTE_NAME,
      editorAlias: "Umbraco.RichText",
      editorUiAlias: "Umb.PropertyEditorUi.Tiptap",
      values: [
        { alias: "extensions", value: ["Umb.Tiptap.RichTextEssentials", "Umb.Tiptap.Block"] },
        { alias: "blocks", value: [{ contentElementTypeKey: elementTypeId }] },
      ],
    });
    if (created.isError) return null;
    rteDtId = extractChainedResult(created)?.id;
  }
  if (!rteDtId) return null;

  // 5 — Doc type that exposes both as properties, allowed at root
  const allDocTypes = await mcpClientManager.callTool("cms", "get-all-document-types", {});
  const docTypes = (extractChainedResult(allDocTypes)?.items ?? []) as Array<{ id: string; alias: string }>;
  let docTypeId = docTypes.find(d => d.alias === PROVISIONED_DOCTYPE_ALIAS)?.id;
  if (!docTypeId) {
    const created = await mcpClientManager.callTool("cms", "create-document-type", {
      name: PROVISIONED_DOCTYPE_NAME,
      alias: PROVISIONED_DOCTYPE_ALIAS,
      icon: "icon-document",
      allowedAsRoot: true,
      compositions: [],
      allowedDocumentTypes: [],
      properties: [
        { name: "Page grid", alias: "pageGrid", dataTypeId: blockGridDtId, group: "Content" },
        { name: "Body", alias: "body", dataTypeId: rteDtId, group: "Content" },
      ],
    });
    if (created.isError) return null;
    docTypeId = extractChainedResult(created)?.id;
  }
  if (!docTypeId) return null;

  return {
    docTypeId,
    blockGrid: {
      donorDocTypeId: docTypeId,
      propertyAlias: "pageGrid",
      elementTypeId,
      blockPropertyAlias: "title",
    },
    rte: {
      donorDocTypeId: docTypeId,
      propertyAlias: "body",
      elementTypeId,
      blockPropertyAlias: "title",
    },
  };
}

interface CreateBlockListFixtureOptions {
  /** Seed the block with a settingsKey + settingsData entry. No-op if the donor exposes no settings element type. */
  seedSettings?: boolean;
}

export async function createBlockListFixture(extra: any, name: string, options: CreateBlockListFixtureOptions = {}): Promise<BlockListFixture | null> {
  const donor = await findDonor("Umbraco.BlockList", extra);
  if (!donor) return null;
  const state = await initContentTestState(extra);

  const seedSettings = options.seedSettings === true && !!donor.settings;
  const layoutEntry: { contentKey: string; settingsKey?: string } = seedSettings
    ? { contentKey: SEEDED_BLOCK_KEY, settingsKey: SEEDED_SETTINGS_KEY }
    : { contentKey: SEEDED_BLOCK_KEY };
  const settingsData = seedSettings && donor.settings
    ? [{
      key: SEEDED_SETTINGS_KEY,
      contentTypeKey: donor.settings.settingsElementTypeId,
      values: [
        { alias: donor.settings.settingsPropertyAlias, value: SEEDED_SETTINGS_VALUE, culture: null, segment: null },
      ],
    }]
    : [];

  const blockListValue = {
    contentData: [
      {
        key: SEEDED_BLOCK_KEY,
        contentTypeKey: donor.elementTypeId,
        values: [
          { alias: donor.blockPropertyAlias, value: SEEDED_VALUE, culture: null, segment: null },
        ],
      },
    ],
    settingsData,
    layout: { "Umbraco.BlockList": [layoutEntry] },
    expose: [{ contentKey: SEEDED_BLOCK_KEY, culture: null, segment: null }],
  };

  const page = await new ContentBuilder()
    .withName(name)
    .withDocumentType(donor.donorDocTypeId)
    .withParent(state.testPageId)
    .withValue(donor.propertyAlias, blockListValue)
    .create();

  return {
    ...donor,
    page,
    pageId: page.getId(),
    seededBlockKey: SEEDED_BLOCK_KEY,
    ...(seedSettings ? { seededSettingsKey: SEEDED_SETTINGS_KEY } : {}),
    cleanup: async () => {
      await ContentTestHelper.cleanupById(page.getId());
    },
  };
}

export interface BlockGridFixture extends DonorInfo {
  page: ContentBuilder;
  pageId: string;
  seededBlockKey: string;
  cleanup(): Promise<void>;
}

export async function createBlockGridFixture(extra: any, name: string): Promise<BlockGridFixture | null> {
  let donor: DonorInfo | null = await findDonor("Umbraco.BlockGrid", extra);
  let parentId: string | undefined;
  if (!donor) {
    // Demo doesn't have a natural BlockGrid donor — provision one. Provisioned
    // pages live at root (allowedAsRoot: true) since the provisioned doc type
    // isn't allowed under the demo's home page.
    const provisioned = await provisionBlockGridAndRteDonors();
    if (!provisioned) return null;
    donor = provisioned.blockGrid;
  } else {
    const state = await initContentTestState(extra);
    parentId = state.testPageId;
  }

  const blockGridValue = {
    contentData: [
      {
        key: SEEDED_BLOCK_KEY,
        contentTypeKey: donor.elementTypeId,
        values: [
          { editorAlias: "Umbraco.TextBox", culture: null, segment: null, alias: donor.blockPropertyAlias, value: SEEDED_VALUE },
        ],
      },
    ],
    settingsData: [],
    layout: {
      "Umbraco.BlockGrid": [
        { contentKey: SEEDED_BLOCK_KEY, columnSpan: 12, rowSpan: 1, areas: [] },
      ],
    },
    expose: [{ contentKey: SEEDED_BLOCK_KEY, culture: null, segment: null }],
  };

  let builder = new ContentBuilder()
    .withName(name)
    .withDocumentType(donor.donorDocTypeId)
    .withValue(donor.propertyAlias, blockGridValue);
  if (parentId) builder = builder.withParent(parentId);
  const page = await builder.create();

  return {
    ...donor,
    page,
    pageId: page.getId(),
    seededBlockKey: SEEDED_BLOCK_KEY,
    cleanup: async () => {
      await ContentTestHelper.cleanupById(page.getId());
    },
  };
}

export interface RteFixture extends DonorInfo {
  page: ContentBuilder;
  pageId: string;
  seededBlockKey: string;
  cleanup(): Promise<void>;
}

export async function createRteFixture(extra: any, name: string): Promise<RteFixture | null> {
  let donor: DonorInfo | null = await findDonor("Umbraco.RichText", extra);
  let parentId: string | undefined;
  if (!donor) {
    const provisioned = await provisionBlockGridAndRteDonors();
    if (!provisioned) return null;
    donor = provisioned.rte;
  } else {
    const state = await initContentTestState(extra);
    parentId = state.testPageId;
  }

  const rteValue = {
    markup: `<p>seeded paragraph</p><umb-rte-block data-content-key="${SEEDED_BLOCK_KEY}"></umb-rte-block>`,
    blocks: {
      contentData: [
        {
          key: SEEDED_BLOCK_KEY,
          contentTypeKey: donor.elementTypeId,
          values: [
            { editorAlias: "Umbraco.TextBox", culture: null, segment: null, alias: donor.blockPropertyAlias, value: SEEDED_VALUE },
          ],
        },
      ],
      settingsData: [],
      layout: { "Umbraco.RichText": [{ contentKey: SEEDED_BLOCK_KEY }] },
      expose: [{ contentKey: SEEDED_BLOCK_KEY, culture: null, segment: null }],
    },
  };

  let builder = new ContentBuilder()
    .withName(name)
    .withDocumentType(donor.donorDocTypeId)
    .withValue(donor.propertyAlias, rteValue);
  if (parentId) builder = builder.withParent(parentId);
  const page = await builder.create();

  return {
    ...donor,
    page,
    pageId: page.getId(),
    seededBlockKey: SEEDED_BLOCK_KEY,
    cleanup: async () => {
      await ContentTestHelper.cleanupById(page.getId());
    },
  };
}
