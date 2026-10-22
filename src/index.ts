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
  checkUmbracoVersion,
  configureVersionCheckHook,
  getVersionCheckMessage,
  UmbracoManagementClient,
  SERVER_INFORMATION_PATH,
  type CollectionConfiguration,
  type ToolCollectionExport,
} from "@umbraco-cms/mcp-server-sdk";
import { CHAINED_DEPS } from "./auth/chained-deps.generated.js";
import { getExpectedUmbracoMajor } from "./config/expected-umbraco-major.js";

// Import the Orval-generated API client
// Tool collections come from the shared registry in collections.ts, which the
// hosted worker also consumes. Stdio mode used to re-declare the list by hand,
// and it drifted: the element collection was added to collections.ts but never
// to the copy here, so every Library element tool was invisible over stdio
// while its integration tests (which import the modules directly) stayed
// green. One list, both entry points — do not reintroduce a local copy.
import { collections } from "./collections.js";

// Import MCP client manager (servers registered at import time via mcp-client.ts)
import { mcpClientManager } from "./umbraco-api/mcp-client.js";
import { mcpServers } from "./config/mcp-servers.js";

// Import registries for tool filtering
import { allModes, allModeNames, allSliceNames, loadServerConfig, clearConfigCache } from "./config/index.js";

// Server-level instructions sent to MCP clients during initialization.
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";

// Configure the API client for use with toolkit helpers
// This connects your generated Orval client to executeGetApiCall, executeVoidApiCall, etc.
// ============================================================================
// Tool Filtering Setup
// ============================================================================

// Clear config cache to ensure fresh config for each server start
clearConfigCache();

// Load server configuration (includes filtering settings from env vars). Moved
// ahead of the McpServer construction below (it used to run after) so the
// version check that follows — which needs auth to reach the CMS, and whose
// message needs to be in hand before the server is constructed — can use it.
const serverConfig = await loadServerConfig(true);

// Create collection config loader with our registries
const configLoader = createCollectionConfigLoader({
  modeRegistry: allModes,
  allModeNames,
  allSliceNames,
});

// Initialize UmbracoFetch so any tool that calls UmbracoManagementClient directly
// (instead of going via chainCms) works in stdio mode. Without this the SDK throws
// "UmbracoFetch not initialized" because the subprocess that runs the chained CMS
// server sets up its own UmbracoFetch — this editor MCP process never did. Also
// moved ahead of the McpServer construction below: the direct version-check
// request right after this needs it initialized too.
initializeUmbracoFetch({
  baseUrl: serverConfig.umbraco.auth.baseUrl,
  clientId: serverConfig.umbraco.auth.clientId,
  clientSecret: serverConfig.umbraco.auth.clientSecret,
});

// Load filtering configuration from server config
const filterConfig: CollectionConfiguration = configLoader.loadFromConfig(serverConfig.umbraco);

// ============================================================================
// Umbraco Major Version Guard
// ============================================================================

// A hung or very slow CMS must not delay `initialize` — this direct request
// (same UmbracoManagementClient<T>({ url, method }) pattern as
// `helpers/preview-url.ts`'s fetchPreviewUrl) carries its own short timeout,
// independent of whatever timeout the eventual chained mcp-dev call might use.
const SERVER_INFORMATION_TIMEOUT_MS = 5000;

await checkUmbracoVersion({
  mcpVersion: packageJson.version,
  expectedUmbracoMajor: getExpectedUmbracoMajor(serverConfig.custom.expectedUmbracoMajor),
  client: {
    getServerInformation: () =>
      UmbracoManagementClient<{ version: string }>(
        { url: SERVER_INFORMATION_PATH, method: "GET" },
        { signal: AbortSignal.timeout(SERVER_INFORMATION_TIMEOUT_MS) },
      ),
  },
});

// Wires the version check's blocking state into withPreExecutionCheck, which
// every editor tool already composes via withStandardDecorators — this fires
// independently of whether a given tool chains to mcp-dev. On a mismatch this
// blocks the first decorated tool call once; the hook clears itself after
// surfacing the message, so a deliberate retry succeeds. On a stdio mismatch,
// the user will also still hit mcp-dev's own separate one-time block on the
// first *chained* tool call, on top of this one — that's expected, pre-existing
// upstream behaviour (see CLAUDE.md), not something this suppresses or retries
// around.
configureVersionCheckHook();

// Fold the version-check message (if any) into the server's own instructions,
// mirroring @umbraco-cms/mcp-dev's own startup sequence exactly.
const versionCheckMessage = getVersionCheckMessage();
const instructions = versionCheckMessage
  ? `${SERVER_INSTRUCTIONS}\n\n${versionCheckMessage}`
  : SERVER_INSTRUCTIONS;

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
    instructions,
  },
);

// Make the underlying Server available to tools that need elicitation
setServerRef(server.server);

// ============================================================================
// Register Tools with Filtering
// ============================================================================

// Annotated so the shared registry is type-checked against the SDK contract here.
const registeredCollections: ToolCollectionExport[] = collections;

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
  for (const collection of registeredCollections) {
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
    `MCP Server started with ${registeredToolCount} tool(s) from ${registeredCollections.length} collection(s)` +
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
