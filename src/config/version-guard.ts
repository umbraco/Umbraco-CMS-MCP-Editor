/**
 * Umbraco-major version guard (#247)
 *
 * Stdio blocks the first tool call once on a mismatch, the same as
 * @umbraco-cms/mcp-dev; hosted only warns via `instructions` (handled by
 * @umbraco-cms/mcp-hosted, see worker.ts). Both use UMBRACO_TARGET_MAJOR as
 * the default and UMBRACO_EXPECTED_MAJOR as the override.
 */

import packageJson from "../../package.json" with { type: "json" };
import {
  chainedVersionCheckEnv,
  normalizeBaseUrl,
  resolveExpectedUmbracoMajor,
  type McpServerConfig,
} from "@umbraco-cms/mcp-server-sdk";

/**
 * The Umbraco major this build targets. This package's major tracks it
 * (18.x on dev/main, 17.x on v17/*), so it comes from the package version
 * rather than a generated constant.
 */
export const UMBRACO_TARGET_MAJOR: string = packageJson.version.split(".")[0];

/**
 * The major the stdio guard checks against: the override when non-blank,
 * otherwise UMBRACO_TARGET_MAJOR.
 */
export function getExpectedUmbracoMajor(override?: string | null): string {
  return resolveExpectedUmbracoMajor(override, UMBRACO_TARGET_MAJOR);
}

/**
 * Tells a chained stdio server which major the editor's own guard already
 * checked, so a child that targets the same major (mcp-dev 18.3.0+/17.8.0+)
 * skips its check instead of blocking the user a second time for the same
 * mismatch. A child built for a different major ignores it and checks itself.
 *
 * Only applied when the child connects to the same Umbraco instance as the
 * editor: the editor's check says nothing about any other instance.
 */
export function withParentCheckedMajor(
  server: McpServerConfig,
  checkedMajor: string,
  editorBaseUrl: string,
): McpServerConfig {
  if (!("command" in server)) return server;
  const childBaseUrl = server.env?.UMBRACO_BASE_URL;
  if (!childBaseUrl || normalizeBaseUrl(childBaseUrl) !== normalizeBaseUrl(editorBaseUrl)) return server;
  return { ...server, env: { ...server.env, ...chainedVersionCheckEnv(checkedMajor) } };
}
