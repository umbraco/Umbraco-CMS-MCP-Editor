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

function buildServers(): McpServerConfig[] {
  try {
    // Guard: Workers runtime doesn't have process.env in the same way
    if (typeof process === "undefined" || !process.env) return [];

    const useMockChain = process.env.USE_MOCK_MCP_CHAIN === "true";

    if (useMockChain) {
      // Mock server for testing — resolve path from dist/ to src/
      const path = require("path");
      const { fileURLToPath } = require("url");
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      return [{
        name: "cms",
        command: "npx",
        args: ["tsx", path.resolve(__dirname, "../src/testing/mock-mcp-server.ts")],
        proxyTools: false,
      }];
    }

    // Real Umbraco CMS MCP server
    return [{
      name: "cms",
      command: "npx",
      args: ["-y", "@umbraco-cms/mcp-dev@17.2.2"],
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
  } catch {
    // Workers runtime or other environment without Node APIs
    return [];
  }
}

/**
 * External MCP servers to chain to.
 * Empty in Workers runtime (chaining uses in-process connections there).
 */
export const mcpServers: McpServerConfig[] = buildServers();
