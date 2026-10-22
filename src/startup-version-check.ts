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
// Note: this AbortSignal only bounds the server/information GET itself —
// UmbracoManagementClient fetches an OAuth token first, and that request
// carries no signal of its own, so it isn't actually bounded by this. See
// withTimeout() below, which bounds the whole client call independently.
const directClient: VersionCheckClient = {
  getServerInformation: () =>
    UmbracoManagementClient<{ version: string }>(
      { url: SERVER_INFORMATION_PATH, method: "GET" },
      { signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS) },
    ),
};

/**
 * Races a client's `getServerInformation()` against its own timer, so a
 * request that hangs somewhere the SDK doesn't apply its own signal (e.g. the
 * OAuth token fetch `UmbracoManagementClient` issues before the GET it does
 * honour a signal for) still can't delay startup. A rejection here (including
 * the timeout) is caught by `checkUmbracoVersion` the same as any other
 * failure, so the guard still never throws.
 */
function withTimeout(client: VersionCheckClient, ms: number): VersionCheckClient {
  return {
    getServerInformation: () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Umbraco version check timed out after ${ms}ms`)), ms);
        client.getServerInformation().then(
          value => {
            clearTimeout(timer);
            resolve(value);
          },
          error => {
            clearTimeout(timer);
            reject(error);
          },
        );
      }),
  };
}

/** Caps how much of a version-check message can reach `instructions`. */
const MAX_VERSION_CHECK_MESSAGE_LENGTH = 300;

/**
 * The message can embed the connected Umbraco's own, network-reachable
 * `server/information` response verbatim (the SDK's "unparseable version"
 * case interpolates it as-is). Every connecting MCP client receives
 * `instructions` as trusted session guidance, so strip control characters (a
 * mismatch/unreachable message is always plain prose — none legitimately need
 * them) and bound its length before it's used.
 */
export function sanitizeVersionCheckMessage(message: string | null): string | null {
  if (!message) return null;
  // eslint-disable-next-line no-control-regex
  const stripped = message.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "").trim();
  if (!stripped) return null;
  return stripped.length > MAX_VERSION_CHECK_MESSAGE_LENGTH
    ? `${stripped.slice(0, MAX_VERSION_CHECK_MESSAGE_LENGTH)}…`
    : stripped;
}

export interface StdioVersionGuardOptions {
  expectedUmbracoMajor: string;
  /** Tests only: a fake `getServerInformation`. */
  client?: VersionCheckClient;
  /** Tests only: an isolated service instead of the SDK singleton. */
  service?: VersionCheckService;
  /** Tests only: overrides VERSION_CHECK_TIMEOUT_MS so a hang case doesn't wait out the real timeout. */
  timeoutMs?: number;
}

/** Runs the check and arms the block. Never throws; returns the message, if any. */
export async function applyStdioVersionGuard({
  expectedUmbracoMajor,
  client = directClient,
  service,
  timeoutMs = VERSION_CHECK_TIMEOUT_MS,
}: StdioVersionGuardOptions): Promise<string | null> {
  await checkUmbracoVersion({
    mcpVersion: packageJson.version,
    expectedUmbracoMajor,
    client: withTimeout(client, timeoutMs),
    service,
  });
  configureVersionCheckHook(service);
  return sanitizeVersionCheckMessage(getVersionCheckMessage(service));
}
