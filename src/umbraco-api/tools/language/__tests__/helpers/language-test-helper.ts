/**
 * Language Test Helper — static utility class for managing
 * language test state via chained CMS tools.
 *
 * Languages use ISO codes (not UUIDs), so cleanup is by ISO code.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class LanguageTestHelper {
  /** Check if a language is configured by listing all and searching by ISO code */
  static async languageExists(isoCode: string): Promise<boolean> {
    try {
      const result = await mcpClientManager.callTool("cms", "get-language", {
        cursor: btoa(JSON.stringify({ s: 0, t: 100 })),
      });
      if (result.isError) return false;
      const data = extractChainedResult(result);
      const items: any[] = data?.items ?? [];
      return items.some((lang: any) => lang.isoCode === isoCode);
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
