/**
 * The Umbraco major version this editor MCP targets.
 *
 * Mirrors the version-guard pattern from the chained `@umbraco-cms/mcp-dev`
 * server's own stdio entry point (its `src/index.ts`): it stamps a
 * `UMBRACO_TARGET_MAJOR` constant (via its Orval target-major transformer)
 * and feeds it to the SDK's `checkUmbracoVersion()`, which folds a mismatch
 * warning into the server's `instructions` and blocks tool execution once
 * via `configureVersionCheckHook()` / `withPreExecutionCheck` (already wired
 * into every tool here through `withStandardDecorators`).
 *
 * We have no Orval generation step in this repo (see CLAUDE.md — this server
 * never talks to the Management API directly), so there's no generated
 * constant to stamp. Hand-maintain this to match the demo-site-template's
 * pinned `Umbraco.Cms` major instead, and bump it alongside that template
 * when upgrading (see the `upgrade-umbraco` skill).
 *
 * Override per-instance via `UMBRACO_EXPECTED_MAJOR` — the same env var
 * `@umbraco-cms/mcp-dev` itself honours for its own chained connection, and
 * that `@umbraco-cms/mcp-hosted`'s `HostedMcpEnv.UMBRACO_EXPECTED_MAJOR`
 * honours for the hosted worker.
 */
export const UMBRACO_TARGET_MAJOR = "18";
