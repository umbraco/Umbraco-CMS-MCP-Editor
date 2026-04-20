/**
 * MCP Client Manager
 *
 * Singleton for calling tools on chained MCP servers from local tools.
 * Registers stdio servers from mcp-servers.ts at import time so the
 * manager is ready when tools are called (both in production and tests).
 *
 * In test mode (USE_IN_PROCESS_CMS=true), the CMS tools run in-process
 * via connectInProcess() — no subprocess, no npx, no per-suite overhead.
 *
 * In hosted mode (worker.ts), the CMS server is registered in-process
 * via mcpClientManager.registerServer() at init time.
 */

import { createMcpClientManager } from "@umbraco-cms/mcp-server-sdk";
import { mcpServers } from "../config/mcp-servers.js";

export const mcpClientManager = createMcpClientManager({});

// In test mode, skip stdio server registration — connectInProcess() will
// override callTool to dispatch CMS calls in-process instead.
const useInProcess = typeof process !== "undefined"
  && process.env?.USE_IN_PROCESS_CMS === "true";

if (!useInProcess) {
  for (const config of mcpServers) {
    mcpClientManager.registerServer(config);
  }
}
