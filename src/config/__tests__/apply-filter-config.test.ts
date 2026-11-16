import { describe, it, expect, jest } from "@jest/globals";
import { applyFilterConfig } from "../apply-filter-config.js";

// Regression guard for the mcp-dev/mcp-hosted 1.0.0-beta.48 upgrade (PR #284):
// Umbraco-MCP-Base#441 fixed a chained-server readonly/slice leak whose
// consumer-side half was a setFilterConfig call the editor template wires
// in, but this project's index.ts never did. Pulled into its own module
// (mirroring worker-dry-run.ts) so the includeSlices -> slices field mapping
// stays covered without importing the whole stdio entry point.
describe("applyFilterConfig", () => {
  it("maps readonly and slice config onto the manager's FilterConfig, renaming includeSlices to slices", () => {
    const setFilterConfig = jest.fn();

    applyFilterConfig(
      { readonly: true, includeSlices: ["read", "list"], excludeSlices: ["delete"] },
      { setFilterConfig },
    );

    expect(setFilterConfig).toHaveBeenCalledTimes(1);
    expect(setFilterConfig).toHaveBeenCalledWith({
      readOnly: true,
      slices: ["read", "list"],
      excludeSlices: ["delete"],
    });
  });

  it("passes undefined fields through as-is", () => {
    const setFilterConfig = jest.fn();

    applyFilterConfig({ readonly: undefined, includeSlices: undefined, excludeSlices: undefined }, { setFilterConfig });

    expect(setFilterConfig).toHaveBeenCalledWith({
      readOnly: undefined,
      slices: undefined,
      excludeSlices: undefined,
    });
  });
});
