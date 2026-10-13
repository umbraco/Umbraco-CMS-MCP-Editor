import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadCmsCollections, getLoadedCmsCollections } from "../umbraco-api/cms-collections-loader.js";

// Cloudflare limits Worker startup to 1 s of CPU. Importing
// @umbraco-cms/mcp-dev's collections builds every mcp-dev tool's schemas, which
// pushed the v18 Editor worker to ~930 ms, so it is loaded on first request
// instead (cms-collections-loader.ts). A static import in worker.ts or
// cms-chained-server.ts would move that cost back into startup.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const staticMcpDevImport = /^\s*import\s+(?!type\b)[^;]*?from\s+["']@umbraco-cms\/mcp-dev(\/[^"']*)?["']/m;

describe("worker startup: mcp-dev is not imported at module scope", () => {
  it.each(["../worker.ts", "../umbraco-api/cms-chained-server.ts"])("%s has no static mcp-dev value import", (file) => {
    expect(read(file)).not.toMatch(staticMcpDevImport);
  });

  it("loads the collections once and caches them", async () => {
    const first = await loadCmsCollections();
    const second = await loadCmsCollections();
    expect(second).toBe(first);
    expect(getLoadedCmsCollections()).toBe(first);
    expect(first.collections.length).toBeGreaterThan(0);
  });
});
