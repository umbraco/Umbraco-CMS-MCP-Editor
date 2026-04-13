/**
 * Content Health Test Helper — static utility class for finding content pages
 * to audit via chained CMS tools.
 *
 * All methods are static. Used in beforeAll to locate test pages for auditing.
 * This collection is read-only — no cleanup is required.
 */

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import listChildrenTool from "../../../content/get/list-children.js";

/** Minimal shape of a content tree item returned by list-children */
export interface ContentHealthPageItem {
  id: string;
  name?: string;
  variants?: Array<{ name: string; culture?: string | null }>;
}

export class ContentHealthTestHelper {
  /**
   * Find the first root content page by calling list-children with no parentId.
   * Returns the page ID or throws if no root pages exist.
   */
  static async findRootPage(
    extra: Parameters<typeof listChildrenTool.handler>[1],
  ): Promise<string> {
    const result = await listChildrenTool.handler({ parentId: undefined }, extra);

    if (result.isError) {
      throw new Error("Failed to list root pages: " + JSON.stringify(result));
    }

    const data = getStructuredContent(result) as any;
    if (!data?.items?.length) {
      throw new Error("No root pages found — Umbraco instance has no content");
    }

    return data.items[0].id as string;
  }

  /**
   * Normalize IDs in a response for snapshot testing.
   * Replaces all UUID-shaped strings with a fixed placeholder.
   */
  static normalizeIds(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeIds(item));
    }

    if (data && typeof data === "object") {
      const normalized: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const key of Object.keys(normalized)) {
        const value = normalized[key];
        if (
          typeof value === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ) {
          normalized[key] = "00000000-0000-0000-0000-000000000000";
        } else if (typeof value === "object" && value !== null) {
          normalized[key] = this.normalizeIds(value);
        }
      }
      return normalized;
    }

    return data;
  }
}
