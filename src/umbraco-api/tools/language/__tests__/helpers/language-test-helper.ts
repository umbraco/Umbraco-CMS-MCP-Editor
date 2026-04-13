/**
 * Language Test Helper — static utility class for managing
 * language test state via chained CMS tools.
 *
 * Languages use ISO codes (not UUIDs), so cleanup is by ISO code.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class LanguageTestHelper {
  /** Check if a language exists by ISO code */
  static async languageExists(isoCode: string): Promise<boolean> {
    try {
      const result = await mcpClientManager.callTool("cms", "get-language", { isoCode });
      return !result.isError;
    } catch {
      return false;
    }
  }

  /** Delete a language by ISO code (best-effort) */
  static async cleanup(isoCode: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "delete-language", { isoCode });
    } catch {
      // Language may not exist — that's fine
    }
  }
}
