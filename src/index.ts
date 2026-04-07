#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * This file sets up and starts the MCP server.
 * Customize this to add your tool collections.
 */

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createToolAnnotations,
  createCollectionConfigLoader,
  shouldIncludeTool,
  setServerRef,
  type CollectionConfiguration,
  type ToolCollectionExport,
} from "@umbraco-cms/mcp-server-sdk";

// Import the Orval-generated API client
// Import tool collections
import contentCollection from "./umbraco-api/tools/content/index.js";
import publishingCollection from "./umbraco-api/tools/publishing/index.js";
import versioningCollection from "./umbraco-api/tools/versioning/index.js";
import mediaCollection from "./umbraco-api/tools/media/index.js";
import mediaManagementCollection from "./umbraco-api/tools/media-management/index.js";
import blueprintCollection from "./umbraco-api/tools/blueprint/index.js";
import translationCollection from "./umbraco-api/tools/translation/index.js";
import languageCollection from "./umbraco-api/tools/language/index.js";
import dictionaryCollection from "./umbraco-api/tools/dictionary/index.js";
import tagCollection from "./umbraco-api/tools/tag/index.js";
import contentHealthCollection from "./umbraco-api/tools/content-health/index.js";
import contentReportingCollection from "./umbraco-api/tools/content-reporting/index.js";
import siteStructureCollection from "./umbraco-api/tools/site-structure/index.js";
import mediaHealthCollection from "./umbraco-api/tools/media-health/index.js";
import bulkOperationsCollection from "./umbraco-api/tools/bulk-operations/index.js";
import memberCollection from "./umbraco-api/tools/member/index.js";
import memberGroupCollection from "./umbraco-api/tools/member-group/index.js";
import memberReportingCollection from "./umbraco-api/tools/member-reporting/index.js";

// Import MCP client manager (for chaining to other MCP servers)
import { mcpClientManager } from "./umbraco-api/mcp-client.js";

// Import server reference setter (for tools that need server-level capabilities)


// Import MCP server chain configuration and register servers
import { mcpServers } from "./config/mcp-servers.js";
for (const config of mcpServers) {
  mcpClientManager.registerServer(config);
}

// Import registries for tool filtering
import { allModes, allModeNames, allSliceNames, loadServerConfig, clearConfigCache } from "./config/index.js";

// Configure the API client for use with toolkit helpers
// This connects your generated Orval client to executeGetApiCall, executeVoidApiCall, etc.
// ============================================================================
// MCP Server Setup
// ============================================================================

// Create MCP server
const server = new McpServer({
  name: "umbraco-editor-mcp",
  version: packageJson.version,
});

// Make the underlying Server available to tools that need elicitation
setServerRef(server.server);

// ============================================================================
// Tool Filtering Setup
// ============================================================================

// Clear config cache to ensure fresh config for each server start
clearConfigCache();

// Load server configuration (includes filtering settings from env vars)
const serverConfig = await loadServerConfig(true);

// Create collection config loader with our registries
const configLoader = createCollectionConfigLoader({
  modeRegistry: allModes,
  allModeNames,
  allSliceNames,
});

// Load filtering configuration from server config
const filterConfig: CollectionConfiguration = configLoader.loadFromConfig(serverConfig.umbraco);

// ============================================================================
// Register Tools with Filtering
// ============================================================================

const collections: ToolCollectionExport[] = [
  contentCollection,
  publishingCollection,
  versioningCollection,
  mediaCollection,
  mediaManagementCollection,
  blueprintCollection,
  translationCollection,
  languageCollection,
  dictionaryCollection,
  tagCollection,
  contentHealthCollection,
  contentReportingCollection,
  siteStructureCollection,
  mediaHealthCollection,
  bulkOperationsCollection,
  memberCollection,
  memberGroupCollection,
  memberReportingCollection,
];
let registeredToolCount = 0;

for (const collection of collections) {
  const collectionName = collection.metadata.name;

  // Get tools for current user (pass user context if needed)
  const tools = collection.tools({});

  for (const tool of tools) {
    // Check if tool should be included based on filtering config
    if (!shouldIncludeTool(tool, { collectionName, config: filterConfig })) {
      continue;
    }

    // Build annotations from tool definition
    const annotations = createToolAnnotations(tool);

    // Register tool with MCP server using registerTool API
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations,
    }, tool.handler);

    registeredToolCount++;
  }
}

// Start the server
async function main() {
  // Connect to chained MCP servers for delegation (no proxied tools)
  // Skip if chaining is disabled via config (DISABLE_MCP_CHAINING=true)
  const chainingEnabled = mcpServers.length > 0 && !serverConfig.custom.disableMcpChaining;

  if (chainingEnabled) {
    console.error("MCP chaining enabled — pre-connecting to chained servers...");
    try {
      for (const srv of mcpServers) {
        await mcpClientManager.connect(srv.name);
        console.error(`Connected to chained server: ${srv.name}`);
      }
    } catch (error) {
      console.error("Warning: Failed to pre-connect chained servers:", error);
      // Continue — tools will retry connection on first call
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`MCP Server started with ${registeredToolCount} tool(s) from ${collections.length} collection(s)`);
}

// Cleanup on shutdown
process.on("SIGINT", async () => {
  await mcpClientManager.disconnectAll();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mcpClientManager.disconnectAll();
  process.exit(0);
});

main().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
