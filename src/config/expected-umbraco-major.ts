/**
 * Expected Umbraco Major Version
 *
 * Single source of truth for the Umbraco major version this MCP server
 * targets, shared by both entry points (`src/index.ts` stdio and
 * `src/worker.ts` hosted).
 *
 * Mirrors `@umbraco-cms/mcp-dev`'s own resolution exactly:
 * `process.env.UMBRACO_EXPECTED_MAJOR?.trim() || UMBRACO_TARGET_MAJOR`
 * — deliberately `?.trim() ||`, not `??`. An override set to an empty (or
 * all-whitespace) string must still fall back to the default, or the check
 * silently no-ops with no log output at all.
 *
 * `@umbraco-cms/mcp-hosted`'s own per-request resolution uses `??` instead
 * (`env.UMBRACO_EXPECTED_MAJOR ?? options.expectedUmbracoMajor`), so an
 * empty-string override behaves differently there — that's an upstream gap
 * tracked as umbraco/Umbraco-MCP-Base#426, not fixed here.
 */

import packageJson from "../../package.json" with { type: "json" };

/**
 * Resolve the Umbraco major version this server targets.
 *
 * @param override - An explicit override (e.g. from `UMBRACO_EXPECTED_MAJOR`
 *   or `--umbraco-expected-major`). Surrounding whitespace is trimmed; an
 *   empty or whitespace-only value falls back to the default, matching
 *   `@umbraco-cms/mcp-dev`'s own `?.trim() ||` behaviour.
 * @returns The expected Umbraco major version, e.g. `"18"`.
 */
export function getExpectedUmbracoMajor(override?: string): string {
  return override?.trim() || packageJson.version.split(".")[0];
}
