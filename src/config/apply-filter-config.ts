/**
 * Forwards this server's resolved readonly mode and slice filters to chained
 * MCP servers (e.g. the "cms" stdio subprocess).
 *
 * Pulled out of index.ts so the field mapping — especially the
 * includeSlices -> slices rename — is unit-testable without importing the
 * whole stdio entry point (same reasoning as worker-dry-run.ts).
 *
 * Must run before any chained server connects: a chained server receives its
 * filters when it is spawned, and McpClientManager.setFilterConfig throws if
 * a connection already exists.
 */
import type { FilterConfig, UmbracoServerConfig } from "@umbraco-cms/mcp-server-sdk";

export function applyFilterConfig(
  umbracoConfig: Pick<UmbracoServerConfig, "readonly" | "includeSlices" | "excludeSlices">,
  manager: { setFilterConfig(filterConfig: FilterConfig | undefined): void },
): void {
  manager.setFilterConfig({
    readOnly: umbracoConfig.readonly,
    slices: umbracoConfig.includeSlices,
    excludeSlices: umbracoConfig.excludeSlices,
  });
}
