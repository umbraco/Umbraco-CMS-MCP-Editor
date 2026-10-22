/**
 * Stdio startup version check
 *
 * Stdio warns, it never blocks — matching the hosted worker's behaviour
 * (see `src/worker.ts` / `@umbraco-cms/mcp-hosted`'s own version check, which
 * folds a mismatch into that request's `instructions` and never blocks tools,
 * deliberately, so one site's mismatch can't leak into another request in the
 * same isolate — umbraco/Umbraco-MCP-Base#224).
 *
 * This module calls the SDK's `checkUmbracoVersion()` (which never throws)
 * and deliberately never calls `configureVersionCheckHook()` — the editor's
 * own guard is instructions-only. `@umbraco-cms/mcp-dev`'s own one-time block
 * on its first *chained* tool call is separate, pre-existing upstream
 * behaviour with no disable switch: it still fires once on a mismatch, on top
 * of the message this module folds into the editor's own `instructions`, and
 * that is expected — this module does not try to suppress or duplicate it.
 */

import {
  checkUmbracoVersion,
  UmbracoManagementClient,
  SERVER_INFORMATION_PATH,
  type VersionCheckClient,
  type VersionCheckService,
} from "@umbraco-cms/mcp-server-sdk";

/**
 * A hung or slow CMS must not delay `initialize` — the direct version-check
 * request is bounded by this timeout so checkUmbracoVersion falls through to
 * its own "unable to verify" message (never throws) instead of hanging.
 */
export const VERSION_CHECK_TIMEOUT_MS = 5000;

/**
 * Default client: a direct (non-chained) call to Umbraco's
 * `server/information` endpoint, the same `UmbracoManagementClient<T>({ url,
 * method })` pattern `preview-url.ts`'s `fetchPreviewUrl` uses. Bounded by
 * `VERSION_CHECK_TIMEOUT_MS` so an unreachable/slow CMS can't delay startup.
 */
function createDirectServerInformationClient(): VersionCheckClient {
  return {
    getServerInformation: () =>
      UmbracoManagementClient<{ version: string }>(
        { url: SERVER_INFORMATION_PATH, method: "GET" },
        { signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS) },
      ),
  };
}

export interface StartupVersionCheckOptions {
  /** This package's own version (logging/diagnostics only — see CheckVersionOptions.mcpVersion). */
  mcpVersion: string;
  /** The Umbraco major this server targets — use `getExpectedUmbracoMajor()`. */
  expectedUmbracoMajor: string;
  /**
   * Overridable for tests: a fake `getServerInformation` drives the mismatch
   * / match cases without a live Umbraco. Defaults to a direct, timeout-bounded
   * call to the real server/information endpoint.
   */
  client?: VersionCheckClient;
  /**
   * Overridable for tests so each test gets isolated state instead of sharing
   * the SDK's module-level singleton. Defaults to that singleton in production.
   */
  service?: VersionCheckService;
}

/**
 * Runs the editor's own, stdio-only version check. Never throws, and never
 * calls `configureVersionCheckHook()` — the result is read back afterwards
 * via the SDK's `getVersionCheckMessage()` and folded into the server's
 * `instructions`; it never blocks a tool call on its own.
 */
export async function checkStdioUmbracoVersion(options: StartupVersionCheckOptions): Promise<void> {
  const client = options.client ?? createDirectServerInformationClient();
  await checkUmbracoVersion({
    mcpVersion: options.mcpVersion,
    expectedUmbracoMajor: options.expectedUmbracoMajor,
    client,
    service: options.service,
  });
}
