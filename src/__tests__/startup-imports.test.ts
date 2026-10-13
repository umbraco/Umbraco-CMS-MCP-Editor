import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCmsCollectionsLoader, loadCmsCollections, getLoadedCmsCollections } from "../umbraco-api/cms-collections-loader.js";

// Cloudflare limits Worker startup to 1 s of CPU. Importing
// @umbraco-cms/mcp-dev's collections builds every mcp-dev tool's schemas, which
// pushed the v18 Editor worker to ~930 ms, so it is loaded on first request
// instead (cms-collections-loader.ts). A static import in worker.ts or
// cms-chained-server.ts would move that cost back into startup.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
// Any static value import, side-effect import or re-export of mcp-dev.
// `import type` / `export type` are erased at build time and allowed.
const MCP_DEV = String.raw`["']@umbraco-cms\/mcp-dev(?:\/[^"']*)?["']`;
const staticMcpDevImport = new RegExp(
  String.raw`^\s*(?:import\s+(?!type\b)(?:[^;]*?\bfrom\s+)?|export\s+(?!type\b)[^;]*?\bfrom\s+)` + MCP_DEV,
  "m",
);

describe("worker startup: mcp-dev is not imported at module scope", () => {
  it.each(["../worker.ts", "../umbraco-api/cms-chained-server.ts"])("%s has no static mcp-dev value import", (file) => {
    expect(read(file)).not.toMatch(staticMcpDevImport);
  });

  it.each([
    ['import { collections } from "@umbraco-cms/mcp-dev/collections";', true],
    ['import "@umbraco-cms/mcp-dev/collections";', true],
    ['import * as cms from "@umbraco-cms/mcp-dev";', true],
    ['export { collections } from "@umbraco-cms/mcp-dev/collections";', true],
    ['export * from "@umbraco-cms/mcp-dev/collections";', true],
    ['import type { CmsTools } from "@umbraco-cms/mcp-dev/tool-types";', false],
    ['export type { CmsTools } from "@umbraco-cms/mcp-dev/tool-types";', false],
    ['const cms = await import("@umbraco-cms/mcp-dev/collections");', false],
  ])("the guard flags %s: %s", (source, flagged) => {
    expect(staticMcpDevImport.test(source)).toBe(flagged);
  });

  it("loads the collections once and caches them", async () => {
    const first = await loadCmsCollections();
    const second = await loadCmsCollections();
    expect(second).toBe(first);
    expect(getLoadedCmsCollections()).toBe(first);
    expect(first.collections.length).toBeGreaterThan(0);
  });
});

describe("cms collections loader", () => {
  it("shares one in-flight load between concurrent callers", async () => {
    let calls = 0;
    const loader = createCmsCollectionsLoader(async () => ({ n: ++calls }));
    const [a, b] = await Promise.all([loader.load(), loader.load()]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it("retries after a failed load instead of caching the failure", async () => {
    let calls = 0;
    const loader = createCmsCollectionsLoader(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return { ok: true };
    });
    await expect(loader.load()).rejects.toThrow("boom");
    expect(() => loader.get()).toThrow("not loaded yet");
    await expect(loader.load()).resolves.toEqual({ ok: true });
    expect(loader.get()).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});
