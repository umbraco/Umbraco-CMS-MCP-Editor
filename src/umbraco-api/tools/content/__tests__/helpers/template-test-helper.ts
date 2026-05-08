/**
 * Template Test Helper — static utility class for finding and cleaning up
 * templates via chained CMS tools.
 *
 * Used in test cleanup and for resolving templates by alias/name.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

interface TemplateData {
  id: string;
  name: string;
  alias: string;
}

export class TemplateTestHelper {
  /** Delete a template by ID — best-effort, swallows errors. */
  static async cleanupById(id: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "delete-template", { id });
    } catch {
      // Best-effort.
    }
  }

  /** Fetch a template's name + alias by ID via chained get-template. Returns null on miss. */
  static async getById(id: string): Promise<TemplateData | null> {
    const result = await mcpClientManager.callTool("cms", "get-template", { id });
    if (result.isError) return null;
    const data = extractChainedResult(result);
    return { id, name: data.name, alias: data.alias };
  }
}
