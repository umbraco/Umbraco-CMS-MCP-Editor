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
 * Activates (or leaves off) dry-run mode for this MCP session, based on the
 * `UMBRACO_DRY_RUN` env var. Called once from `UmbracoMcpAgent.init()` —
 * `configureDryRunMode` is global SDK state, not scoped per-request.
 *
 * Parses case-insensitively, matching stdio's existing SDK parsing
 * (`String(value).toLowerCase() === "true"`) rather than `UMBRACO_READONLY`'s
 * stricter hosted check (`env.UMBRACO_READONLY === "true"`). Unset, empty, or
 * any other value leaves dry-run off. Coerces with `String(...)` first (rather
 * than relying on the declared type) because a Worker var can arrive as a
 * non-string — e.g. an unquoted TOML boolean or a dashboard JSON var — and
 * `.toLowerCase()` on a non-string would otherwise throw during `init()`.
 */
export function applyWorkerDryRun(env: { UMBRACO_DRY_RUN?: string }): void {
  configureDryRunMode(String(env.UMBRACO_DRY_RUN ?? "").toLowerCase() === "true");
}
