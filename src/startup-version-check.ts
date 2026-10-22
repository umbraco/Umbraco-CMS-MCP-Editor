/**
 * Stdio Umbraco-major guard — the same startup sequence @umbraco-cms/mcp-dev
 * runs for itself. On a mismatch the first tool call is blocked once (a retry
 * succeeds) and the returned message goes into the server's `instructions`.
 * See CLAUDE.md "Umbraco-major version guard" for the stdio/hosted split.
 */

import {
  checkUmbracoVersion,
  configureVersionCheckHook,
  getVersionCheckMessage,
  UmbracoManagementClient,
  SERVER_INFORMATION_PATH,
  type VersionCheckClient,
  type VersionCheckService,
} from "@umbraco-cms/mcp-server-sdk";
import packageJson from "../package.json" with { type: "json" };

// Bounds the startup request so a hung CMS can't delay `initialize`.
const VERSION_CHECK_TIMEOUT_MS = 5000;

// Direct (non-chained) call, same pattern as preview-url.ts's fetchPreviewUrl.
const directClient: VersionCheckClient = {
  getServerInformation: () =>
    UmbracoManagementClient<{ version: string }>(
      { url: SERVER_INFORMATION_PATH, method: "GET" },
      { signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS) },
    ),
};

export interface StdioVersionGuardOptions {
  expectedUmbracoMajor: string;
  /** Tests only: a fake `getServerInformation`. */
  client?: VersionCheckClient;
  /** Tests only: an isolated service instead of the SDK singleton. */
  service?: VersionCheckService;
}

/** Runs the check and arms the block. Never throws; returns the message, if any. */
export async function applyStdioVersionGuard({
  expectedUmbracoMajor,
  client = directClient,
  service,
}: StdioVersionGuardOptions): Promise<string | null> {
  await checkUmbracoVersion({ mcpVersion: packageJson.version, expectedUmbracoMajor, client, service });
  configureVersionCheckHook(service);
  return getVersionCheckMessage(service);
}
