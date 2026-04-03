/**
 * MCP Client Manager
 *
 * Singleton for calling tools on chained MCP servers from local tools.
 *
 * The manager is created empty — servers are registered at startup by:
 * - index.ts (stdio mode): registers stdio servers from mcp-servers.ts
 * - worker.ts (hosted mode): registers in-process server via registerChainedTools
 *
 * Tools call mcpClientManager.callTool("cms", toolName, args) at runtime.
 * The manager must have a "cms" server registered before tools are called.
 */

import { createMcpClientManager } from "@umbraco-cms/mcp-server-sdk";

export const mcpClientManager = createMcpClientManager({});
