import { z } from "zod";
import { withStandardDecorators, createToolResultError, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildBlockWriteResult, isBlockListOrGridValue, isRteWithBlocks } from "../../helpers/block-builder.js";
import { previewUrlSchema } from "../../helpers/preview-url.js";
import { validationResultSchema } from "../../helpers/validate-document.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the block property"),
  propertyAlias: z.string().describe("The document property alias holding the block (e.g. 'mainContent'). Use inspect-blocks to find this."),
  contentKey: z.string().uuid().describe("The unique key of the block to remove. Use inspect-blocks to find this."),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string(),
  previewUrl: previewUrlSchema,
  validation: validationResultSchema,
});

type GridLayoutItem = {
  contentKey: string;
  areas?: Array<{ key: string; items: GridLayoutItem[] }>;
};

function gridContainsBlock(items: GridLayoutItem[], contentKey: string): boolean {
  return items.some(item =>
    item.contentKey === contentKey ||
    (item.areas ?? []).some(area => gridContainsBlock(area.items ?? [], contentKey)),
  );
}

type BlockLocation =
  | { ok: true; confirmMessage: string }
  | { ok: false; errorText: string };

// Confirms the block exists before prompting, so a bad contentKey errors without
// a confirmation dialog. The removal itself is done by delete-document-block.
function locateBlock(
  propValue: any,
  editorAlias: string | null | undefined,
  propertyAlias: string,
  contentKey: string,
  pageName: string,
): BlockLocation {
  const notFound: BlockLocation = { ok: false, errorText: `Block '${contentKey}' was not found in property '${propertyAlias}'.` };
  const draftSuffix = "Will be saved as a draft, not published.";

  if (isBlockListOrGridValue(propValue) && editorAlias === "Umbraco.BlockList") {
    const layoutList: Array<{ contentKey: string }> = propValue.layout?.["Umbraco.BlockList"] ?? [];
    if (!layoutList.some(e => e.contentKey === contentKey)) return notFound;
    return { ok: true, confirmMessage: `Remove block ${contentKey} from "${pageName}" (BlockList ${propertyAlias})? ${draftSuffix}` };
  }

  if (isBlockListOrGridValue(propValue) && editorAlias === "Umbraco.BlockGrid") {
    if (!gridContainsBlock(propValue.layout?.["Umbraco.BlockGrid"] ?? [], contentKey)) return notFound;
    return { ok: true, confirmMessage: `Remove block ${contentKey} from "${pageName}" (BlockGrid ${propertyAlias})? ${draftSuffix}` };
  }

  if (isRteWithBlocks(propValue)) {
    if (!(propValue.blocks.contentData ?? []).some((e: any) => e.key === contentKey)) return notFound;
    return { ok: true, confirmMessage: `Remove block ${contentKey} from a Rich Text in "${pageName}" (${propertyAlias})? ${draftSuffix}` };
  }

  return { ok: false, errorText: `Property '${propertyAlias}' on '${pageName}' is not a block-bearing property (BlockList, BlockGrid, or Rich Text with blocks). Use inspect-blocks to confirm.` };
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-block",
  description: "Remove a single block from a BlockList, BlockGrid, or Rich Text property on a page. Supply the page ID, the property alias, and the block's contentKey — use inspect-blocks first to find these. The change is saved as a draft, NOT published. You will be asked to confirm before removing.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id, propertyAlias, contentKey, culture, segment }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";

    const prop = (doc.values ?? []).find(
      v => v.alias === propertyAlias &&
        (v.culture ?? null) === (culture ?? null) &&
        (v.segment ?? null) === (segment ?? null),
    );
    if (!prop) {
      return createToolResultError({
        content: [{ type: "text", text: `Property '${propertyAlias}' not found on page '${pageName}'. Use inspect-blocks to see available properties.` }],
        isError: true,
      });
    }

    const location = locateBlock(prop.value, prop.editorAlias, propertyAlias, contentKey, pageName);
    if (!location.ok) {
      return createToolResultError({ content: [{ type: "text", text: location.errorText }], isError: true });
    }

    if (!await requestApproval(extra, location.confirmMessage)) {
      return createToolResultError({ content: [{ type: "text", text: "Cancelled by user." }], isError: true });
    }

    const deleteResult = await chainCms("delete-document-block", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      contentKey,
    });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return buildBlockWriteResult(id, pageName, contentKey, `Removed block from "${pageName}" (saved, not published)`);
  },
};

export default withStandardDecorators(tool);
