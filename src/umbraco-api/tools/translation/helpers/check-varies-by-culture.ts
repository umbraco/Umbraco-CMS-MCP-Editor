import { chainCms } from "../../../cms-chain.js";
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";

/**
 * Returns null when the document type for the given document supports culture
 * variants. Returns an error result envelope (400) when the doctype is invariant.
 *
 * Use as a pre-flight before create-variant / copy-variant. Without this check,
 * Umbraco silently drops the new variant entry on persist, and the editor MCP
 * tool reports a misleading false success.
 */
export async function checkVariesByCulture(
  documentId: string,
): Promise<null | ReturnType<typeof createToolResultError>> {
  const docResult = await chainCms("get-document-by-id", { id: documentId });
  if (!docResult.ok) return docResult.errorResult;

  const docTypeId = docResult.data.documentType.id;
  const docTypeResult = await chainCms("get-document-type-by-id", { id: docTypeId });
  if (!docTypeResult.ok) return docTypeResult.errorResult;

  const variesByCulture = docTypeResult.data.variesByCulture === true;

  if (!variesByCulture) {
    const dt = docTypeResult.data;
    return createToolResultError({
      status: 400,
      title: "Document type is invariant",
      detail:
        `Document type "${dt.alias ?? dt.name ?? "(unknown)"}" ` +
        `does not allow culture variants. Enable 'Allow segmentation/variation by culture' ` +
        `on the document type in the Umbraco backoffice (Settings → Document Types) before ` +
        `creating or copying variants.`,
    });
  }

  return null;
}
