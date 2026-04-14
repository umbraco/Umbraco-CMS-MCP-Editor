/**
 * MCP Client Manager
 *
 * Singleton for calling tools on chained MCP servers from local tools.
 * Registers stdio servers from mcp-servers.ts at import time so the
 * manager is ready when tools are called (both in production and tests).
 *
 * In hosted mode (worker.ts), the CMS server is registered
 * additionally via mcpClientManager.registerServer() at init time.
 */

import { createMcpClientManager } from "@umbraco-cms/mcp-server-sdk";
import { mcpServers } from "../config/mcp-servers.js";

export const mcpClientManager = createMcpClientManager({});

for (const config of mcpServers) {
  mcpClientManager.registerServer(config);
}
