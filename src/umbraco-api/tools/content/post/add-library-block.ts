import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { toPlacement } from "../../helpers/block-builder.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";
import { validateDocumentState, validationResultSchema } from "../../helpers/validate-document.js";

const positionSchema = z.object({
  mode: z.enum(["append", "prepend", "before", "after"]).describe("Where to place the block relative to existing blocks (within a BlockGrid area when areaKey is given)"),
  anchorContentKey: z.string().uuid().optional().describe("Required for 'before' or 'after' — the contentKey (or a Library block's layoutKey) of the anchor block"),
}).optional();

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to add the block to"),
  propertyAlias: z.string().describe("The document property alias of the BlockList, BlockGrid, or Rich Text property (e.g. 'contentRows'). Use inspect-blocks to find this."),
  elementId: z.string().uuid().describe("The ID of the existing Library Element to insert. Use search-elements or list-element-children to find it. Its element type must be allowed in this property."),
  position: positionSchema.describe("Where to insert the block. Defaults to 'append'."),
  columnSpan: z.number().int().min(1).max(12).optional().describe("BlockGrid only — column span (1-12). Defaults to 12."),
  rowSpan: z.number().int().min(1).optional().describe("BlockGrid only — row span. Defaults to 1."),
  areaKey: z.string().uuid().optional().describe("BlockGrid only — insert into this named area of a parent block instead of the top-level rows"),
  parentContentKey: z.string().uuid().optional().describe("BlockGrid only — required with areaKey: the contentKey of the block that owns the area"),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  elementId: z.string().describe("The Library Element id the new block links to"),
  layoutKey: z.string().optional().describe("The new block's own layout key — use it to target this placement when the same Element appears more than once"),
  elementName: z.string(),
  elementPublished: z.boolean().describe("Whether the Element is published. A Library block only renders on the site once its Element is published."),
  previewUrl: previewUrlSchema,
  validation: validationResultSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "add-library-block",
  description: "Add an existing Library Element to a page as a linked block, mirroring the Library view of the back office's \"Add block\" dialog. Works for BlockList, BlockGrid, and Rich Text properties. The block shows the Element's shared content — nothing is copied, so later edits to the Element (with edit-element) appear on every page that uses it. Find the Element with search-elements or list-element-children, and the propertyAlias with inspect-blocks. To add a new block with local content instead, use add-blocklist-block, add-blockgrid-block, or add-rte-block. The page is saved as a draft, NOT published.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, propertyAlias, elementId, position, columnSpan, rowSpan, areaKey, parentContentKey, culture, segment }) => {
    const fail = (text: string) => createToolResultError({ content: [{ type: "text", text }], isError: true });
    const resolvedPosition = position ?? { mode: "append" as const };
    if ((resolvedPosition.mode === "before" || resolvedPosition.mode === "after") && !resolvedPosition.anchorContentKey) {
      return fail(`position.anchorContentKey is required when mode is '${resolvedPosition.mode}'.`);
    }
    if (areaKey && !parentContentKey) {
      return fail("parentContentKey is required when areaKey is provided — pick the block whose area you want to insert into.");
    }

    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";

    const elementResult = await chainCms("get-element-by-id", { id: elementId });
    if (!elementResult.ok) {
      return fail(`Library Element '${elementId}' was not found. Use search-elements or list-element-children to find the Element's id.`);
    }
    const element = elementResult.data;
    const elementName = element.variants?.[0]?.name ?? "Unknown";
    const elementPublished = (element.variants ?? []).some((v) => v.state === "Published" || v.state === "PublishedPendingChanges");

    const isGrid = columnSpan !== undefined || rowSpan !== undefined || areaKey !== undefined;
    const createResult = await chainCms("create-document-block", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      libraryElementId: elementId,
      placement: toPlacement(resolvedPosition),
      ...(isGrid
        ? {
            grid: {
              ...(columnSpan !== undefined ? { columnSpan } : {}),
              ...(rowSpan !== undefined ? { rowSpan } : {}),
              ...(areaKey && parentContentKey ? { areaKey, parentContentKey } : {}),
            },
          }
        : {}),
    });
    if (!createResult.ok) return createResult.errorResult;
    const created = createResult.data.results[0];

    const baseMessage = elementPublished
      ? `Added Library Element "${elementName}" to "${pageName}" as a linked block (saved, not published)`
      : `Added Library Element "${elementName}" to "${pageName}" as a linked block (saved, not published) — the Element is not published yet, so the block won't render until it is (publish-element)`;
    const validation = await validateDocumentState(id);
    const message = validation.valid
      ? baseMessage
      : `${baseMessage} — but ${validation.errors.length} validation error(s) must be resolved before this page can be published`;

    return createToolResult({
      message,
      id,
      name: pageName,
      elementId: created.contentKey,
      ...(created.layoutKey ? { layoutKey: created.layoutKey } : {}),
      elementName,
      elementPublished,
      previewUrl: await fetchPreviewUrl(id),
      validation,
    });
  },
};

export default withStandardDecorators(tool);
