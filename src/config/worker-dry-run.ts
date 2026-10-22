/**
 * Hosted worker wiring for UMBRACO_DRY_RUN.
 *
 * @umbraco-cms/mcp-hosted's `HostedMcpEnv` / `loadWorkerConfig` don't read this
 * var (unlike `UMBRACO_READONLY`), so the Worker has to activate dry-run mode
 * itself. Stdio already gets this for free: the SDK's `getServerConfig()`
 * (called by our `loadServerConfig`) calls `configureDryRunMode(config.dryRun
 * === true)` itself.
 *
 * No `cloudflare:*` imports here so this stays importable from plain Jest.
 */
import { configureDryRunMode } from "@umbraco-cms/mcp-server-sdk";

/**
 * Activates (or leaves off) dry-run mode for the current Worker request,
 * based on the `UMBRACO_DRY_RUN` env var.
 *
 * Parses case-insensitively, matching stdio's existing SDK parsing
 * (`String(value).toLowerCase() === "true"`) rather than `UMBRACO_READONLY`'s
 * stricter hosted check (`env.UMBRACO_READONLY === "true"`). Unset, empty, or
 * any other value leaves dry-run off.
 */
export function applyWorkerDryRun(env: { UMBRACO_DRY_RUN?: string }): void {
  configureDryRunMode(env.UMBRACO_DRY_RUN?.toLowerCase() === "true");
}
