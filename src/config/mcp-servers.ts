/**
 * MCP Server Chain Configuration
 *
 * Configure external MCP servers that this server can delegate to internally.
 * Tools from these servers are called via mcpClientManager.callTool() but are
 * NOT exposed/proxied to the editor client.
 *
 * This module is safe in both Node.js (stdio) and Cloudflare Workers (hosted)
 * runtimes. In Workers, mcpServers is empty since chaining uses in-process
 * connections instead of stdio subprocesses.
 */

import type { McpServerConfig } from "@umbraco-cms/mcp-server-sdk";

async function buildServers(): Promise<McpServerConfig[]> {
  // Guard: Workers runtime doesn't have process.env in the same way. We bail
  // out before any node:* dynamic imports so they're never evaluated there.
  if (typeof process === "undefined" || !process.env) return [];

  const useMockChain = process.env.USE_MOCK_MCP_CHAIN === "true";

  if (useMockChain) {
    // Mock server for testing — resolve path from dist/ to src/
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    return [{
      name: "cms",
      command: "npx",
      args: ["tsx", path.resolve(__dirname, "../src/testing/mock-mcp-server.ts")],
      proxyTools: false,
    }];
  }

  // Real Umbraco CMS MCP server.
  // Spawn the locally installed @umbraco-cms/mcp-dev binary directly via the
  // current Node process. This guarantees the subprocess is the exact build
  // our types come from — no version-string round-trip through npx, no
  // registry lookup, works offline. We can't `require()` the package's
  // package.json directly because its exports field doesn't expose the
  // subpath, so we use module.findPackageJSON (Node 22.14+) to locate it.
  // Dynamic imports keep these node:* modules out of the bundler's static
  // graph, which matters because this file is also evaluated in the Workers
  // build (where we already returned [] above).
  const { findPackageJSON } = await import("node:module");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const pkgPath = findPackageJSON("@umbraco-cms/mcp-dev", import.meta.url);
  if (!pkgPath) throw new Error("Could not locate @umbraco-cms/mcp-dev package.json");
  const cmsDevPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const binEntry = typeof cmsDevPkg.bin === "string"
    ? cmsDevPkg.bin
    : cmsDevPkg.bin
      ? Object.values(cmsDevPkg.bin)[0]
      : undefined;
  if (!binEntry) throw new Error("@umbraco-cms/mcp-dev has no bin entry");
  const binAbs = path.resolve(path.dirname(pkgPath), binEntry);

  return [{
    name: "cms",
    command: process.execPath,
    args: [binAbs],
    env: {
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      UMBRACO_BASE_URL: process.env.UMBRACO_BASE_URL || "http://localhost:44391",
      UMBRACO_CLIENT_ID: process.env.UMBRACO_CLIENT_ID || "",
      UMBRACO_CLIENT_SECRET: process.env.UMBRACO_CLIENT_SECRET || "",
      // Clear tool filters so our editor tool names (search-content etc.) don't
      // leak to the dev MCP which uses different names (search-document etc.).
      // The SDK always merges process.env into chained server env, so we must
      // explicitly override these to prevent filter propagation.
      UMBRACO_INCLUDE_TOOLS: "",
      UMBRACO_EXCLUDE_TOOLS: "",
      UMBRACO_INCLUDE_TOOL_COLLECTIONS: "",
      UMBRACO_EXCLUDE_TOOL_COLLECTIONS: "",
      UMBRACO_INCLUDE_SLICES: "",
      UMBRACO_EXCLUDE_SLICES: "",
      UMBRACO_TOOL_MODES: "",
    },
    proxyTools: false,
  }];
}

/**
 * External MCP servers to chain to.
 * Empty in Workers runtime (chaining uses in-process connections there).
 */
export const mcpServers: McpServerConfig[] = await buildServers().catch((e) => {
  if (typeof process !== "undefined") {
    console.error("[mcp-servers] Failed to build chained server config:", (e as Error)?.message ?? e);
  }
  return [];
});
