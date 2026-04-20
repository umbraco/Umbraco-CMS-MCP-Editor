/**
 * Bulk Operations Test Helper — static utility class for managing
 * test state needed by bulk operation tests.
 *
 * Provides page lookup and cleanup via chained CMS tools.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class BulkOperationsTestHelper {
  /** Get the document type ID from an existing page */
  static async getDocumentTypeId(pageId: string): Promise<string | undefined> {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
    if (result.isError) return undefined;
    const data = extractChainedResult(result);
    return data?.documentType?.id;
  }

  /** Delete a page by ID (move to recycle bin then permanent delete) */
  static async deletePage(pageId: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "move-document-to-recycle-bin", { id: pageId });
    } catch {
      // May already be in recycle bin
    }
    try {
      await mcpClientManager.callTool("cms", "delete-document-recycle-bin-item", { id: pageId });
    } catch {
      // Best-effort
    }
  }
}
