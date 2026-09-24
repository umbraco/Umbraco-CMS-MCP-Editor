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
  gatherChainedTools,
  setServerRef,
  initializeUmbracoFetch,
  useDraft202012ToolSchemas,
  type CollectionConfiguration,
  type ToolCollectionExport,
} from "@umbraco-cms/mcp-server-sdk";
import { CHAINED_DEPS } from "./auth/chained-deps.generated.js";

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
import siteStructureCollection from "./umbraco-api/tools/site-structure/index.js";
import bulkOperationsCollection from "./umbraco-api/tools/bulk-operations/index.js";
import memberCollection from "./umbraco-api/tools/member/index.js";
import memberGroupCollection from "./umbraco-api/tools/member-group/index.js";
import memberReportingCollection from "./umbraco-api/tools/member-reporting/index.js";
import schedulingCollection from "./umbraco-api/tools/scheduling/index.js";
import redirectCollection from "./umbraco-api/tools/redirect/index.js";
import relationshipsCollection from "./umbraco-api/tools/relationships/index.js";
import publicAccessCollection from "./umbraco-api/tools/public-access/index.js";
import notificationsCollection from "./umbraco-api/tools/notifications/index.js";
import recycleBinCollection from "./umbraco-api/tools/recycle-bin/index.js";
import accountCollection from "./umbraco-api/tools/account/index.js";

// Import MCP client manager (servers registered at import time via mcp-client.ts)
import { mcpClientManager } from "./umbraco-api/mcp-client.js";
import { mcpServers } from "./config/mcp-servers.js";

// Import registries for tool filtering
import { allModes, allModeNames, allSliceNames, loadServerConfig, clearConfigCache } from "./config/index.js";

// Server-level instructions sent to MCP clients during initialization.
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";

import { setHumanInTheLoopOverride } from "./umbraco-api/tools/helpers/human-in-the-loop.js";

// Configure the API client for use with toolkit helpers
// This connects your generated Orval client to executeGetApiCall, executeVoidApiCall, etc.
// ============================================================================
// MCP Server Setup
// ============================================================================

// Create MCP server
const server = new McpServer(
  {
    name: "umbraco-editor-mcp",
    version: packageJson.version,
  },
  {
    instructions: SERVER_INSTRUCTIONS,
  },
);

// Make the underlying Server available to tools that need elicitation
setServerRef(server.server);

// ============================================================================
// Tool Filtering Setup
// ============================================================================

// Clear config cache to ensure fresh config for each server start
clearConfigCache();

// Load server configuration (includes filtering settings from env vars)
const serverConfig = await loadServerConfig(true);
setHumanInTheLoopOverride(serverConfig.custom.humanInTheLoop);

// Create collection config loader with our registries
const configLoader = createCollectionConfigLoader({
  modeRegistry: allModes,
  allModeNames,
  allSliceNames,
});

// Initialize UmbracoFetch so any tool that calls UmbracoManagementClient directly
// (instead of going via chainCms) works in stdio mode. Without this the SDK throws
// "UmbracoFetch not initialized" because the subprocess that runs the chained CMS
// server sets up its own UmbracoFetch — this editor MCP process never did.
initializeUmbracoFetch({
  baseUrl: serverConfig.umbraco.auth.baseUrl,
  clientId: serverConfig.umbraco.auth.clientId,
  clientSecret: serverConfig.umbraco.auth.clientSecret,
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
  siteStructureCollection,
  bulkOperationsCollection,
  memberCollection,
  memberGroupCollection,
  memberReportingCollection,
  schedulingCollection,
  redirectCollection,
  relationshipsCollection,
  publicAccessCollection,
  notificationsCollection,
  recycleBinCollection,
  accountCollection,
];
// Start the server
async function main() {
  // Connect to chained MCP servers. The dev MCP filters its own tool list by
  // the authenticated user — we read that filtered list back and let
  // shouldIncludeTool gate each editor wrapper against its chainedDeps.
  const chainingEnabled = mcpServers.length > 0 && !serverConfig.custom.disableMcpChaining;

  let availableChainedTools: ReadonlySet<string> | undefined;
  if (chainingEnabled) {
    console.error("MCP chaining enabled — pre-connecting to chained servers...");
    try {
      for (const srv of mcpServers) {
        await mcpClientManager.connect(srv.name);
        console.error(`Connected to chained server: ${srv.name}`);
      }
      availableChainedTools = await gatherChainedTools(
        mcpClientManager,
        mcpServers.map((s) => s.name),
      );
      console.error(`Chained servers expose ${availableChainedTools.size} tool(s) for this user.`);
    } catch (error) {
      console.error("Warning: Failed to pre-connect chained servers:", error);
      // Without the chained list we can't gate by deps, so leave it undefined
      // and shouldIncludeTool will register all tools (they'll fail at runtime
      // if a dep is missing).
    }
  }

  let registeredToolCount = 0;
  let skippedByDeps = 0;
  for (const collection of collections) {
    const collectionName = collection.metadata.name;
    const tools = collection.tools({});

    for (const tool of tools) {
      // Overlay deps from the generated map so the SDK's shouldIncludeTool
      // can apply the chained-deps rule. Future: declare chainedDeps inline
      // on each tool and drop the overlay entirely.
      const toolWithDeps =
        CHAINED_DEPS[tool.name] && !tool.chainedDeps
          ? { ...tool, chainedDeps: CHAINED_DEPS[tool.name] }
          : tool;

      if (!shouldIncludeTool(toolWithDeps, { collectionName, config: filterConfig, availableChainedTools })) {
        if (availableChainedTools && CHAINED_DEPS[tool.name]) skippedByDeps++;
        continue;
      }

      const annotations = createToolAnnotations(tool);

      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations,
        ...((tool as { _meta?: Record<string, unknown> })._meta
          ? { _meta: (tool as { _meta?: Record<string, unknown> })._meta! }
          : {}),
      } as Parameters<typeof server.registerTool>[1], tool.handler);

      registeredToolCount++;
    }
  }

  // Advertise JSON Schema draft 2020-12 (not the default draft-7) for tool
  // schemas, matching the fix applied to the SDK's own stdio template
  // (umbraco/Umbraco-MCP-Base@23ea2f3). Without this, strict draft-2020-12
  // MCP clients can reject our tool schemas.
  useDraft202012ToolSchemas(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `MCP Server started with ${registeredToolCount} tool(s) from ${collections.length} collection(s)` +
      (skippedByDeps > 0 ? ` (${skippedByDeps} tool(s) hidden — chained deps not available for this user)` : ""),
  );
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
