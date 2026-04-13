/**
 * Content Reporting Test Helper — static utility class for verifying
 * connectivity and normalizing output for content-reporting integration tests.
 *
 * All tools in this collection are read-only reports — no cleanup is needed.
 * The helper provides connectivity verification and ID normalization for
 * snapshot testing.
 */

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import reportRecentlyChangedTool from "../../get/report-recently-changed.js";

export class ContentReportingTestHelper {
  /**
   * Verify connectivity to the Umbraco instance by calling report-recently-changed.
   * Throws if the call fails — use in beforeAll to gate the test suite.
   */
  static async verifyConnectivity(
    extra: Parameters<typeof reportRecentlyChangedTool.handler>[1],
  ): Promise<void> {
    const result = await reportRecentlyChangedTool.handler(
      { daysBack: 3650, parentId: undefined },
      extra,
    );

    if (result.isError) {
      throw new Error(
        "Content reporting connectivity check failed: " +
          JSON.stringify(result),
      );
    }

    const data = getStructuredContent(result) as any;
    if (!data || typeof data.scannedPages !== "number") {
      throw new Error(
        "Content reporting connectivity check returned unexpected data: " +
          JSON.stringify(data),
      );
    }
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
      const normalized: Record<string, unknown> = {
        ...(data as Record<string, unknown>),
      };
      for (const key of Object.keys(normalized)) {
        const value = normalized[key];
        if (
          typeof value === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
          )
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
