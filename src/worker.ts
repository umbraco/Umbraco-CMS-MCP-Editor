/**
 * Cloudflare Worker Entry Point
 *
 * Hosted MCP server deployment for Cloudflare Workers.
 * Uses the same tool collections as the stdio entry point (index.ts)
 * but runs over Streamable HTTP with OAuth authentication.
 *
 * Editor tools call mcpClientManager.callTool("cms", ...) to delegate
 * to CMS dev MCP tools. In stdio mode this uses a subprocess; here we
 * register the CMS as an in-process server so the same tool code works.
 */

// Wrangler virtual modules (resolved at wrangler build time)
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OAuthProvider from "@cloudflare/workers-oauth-provider";

// Hosted MCP building blocks
import {
  createDefaultHandler,
  createWorkerExport,
  createPerRequestServer,
  getServerOptions,
  type HostedMcpEnv,
  type AuthProps,
  type ChainedServerConsentConfig,
} from "@umbraco-cms/mcp-hosted";

// Import tool collections and registries (shared with stdio mode via collections.ts)
import { collections, allModes, allModeNames, allSliceNames } from "./collections.js";
import { setServerRef } from "./umbraco-api/server-ref.js";
import { mcpClientManager } from "./umbraco-api/mcp-client.js";

// Import CMS collections for in-process chaining
import {
  collections as cmsCollections,
  allModes as cmsModes,
  allModeNames as cmsModeNames,
  allSliceNames as cmsSliceNames,
  UmbracoManagementClient as CmsClient,
} from "@umbraco-cms/mcp-dev/collections";

// ============================================================================
// Server Configuration
// ============================================================================

const cmsChainedServer: ChainedServerConsentConfig = {
  name: "cms",
  displayName: "umbraco-cms-mcp",
  modeRegistry: cmsModes,
  collections: cmsCollections,
  allModeNames: cmsModeNames,
  allSliceNames: cmsSliceNames,
};

const options = {
  name: "umbraco-editor-mcp",
  version: "1.0.0",
  collections,
  modeRegistry: allModes,
  allModeNames,
  allSliceNames,
  enableConsentToolSelection: true,
  authOptions: { showReauthButton: true },
  chainedServers: [cmsChainedServer],
};

const serverOptions = getServerOptions(options);

// ============================================================================
// McpAgent Durable Object
// ============================================================================

export class UmbracoMcpAgent extends McpAgent<HostedMcpEnv, unknown, AuthProps> {
  server!: McpServer;

  async init() {
    this.server = await createPerRequestServer(
      serverOptions,
      this.env,
      this.props!
    );

    // Make the underlying Server available to tools that need elicitation.
    setServerRef(this.server.server);

    // Register the CMS as an in-process server on mcpClientManager so
    // editor tools can call mcpClientManager.callTool("cms", ...).
    // The clientFactory provides the CMS Orval client which uses the
    // same fetch transport configured by createPerRequestServer.
    mcpClientManager.registerServer({
      transport: "in-process" as const,
      name: "cms",
      collections: cmsCollections,
      modeRegistry: cmsModes,
      allModeNames: cmsModeNames,
      allSliceNames: cmsSliceNames,
      proxyTools: false,
      clientFactory: () => CmsClient.getClient(),
      // Pass a permissive user so CMS tool enabled() checks pass.
      // The real user auth is handled by the OAuth/token layer.
      // Permissive mock user so all CMS tool enabled() checks pass.
      // Real user auth is handled by the OAuth/token layer.
      user: {
        fallbackPermissions: [
          "Umb.Document.Create", "Umb.Document.Read", "Umb.Document.Update",
          "Umb.Document.Delete", "Umb.Document.Publish", "Umb.Document.Unpublish",
          "Umb.Document.Move", "Umb.Document.Sort", "Umb.Document.Duplicate",
        ],
        allowedSections: [
          "Umb.Section.Content", "Umb.Section.Media", "Umb.Section.Settings",
          "Umb.Section.Users", "Umb.Section.Members", "Umb.Section.Packages",
          "Umb.Section.Translation",
        ],
        userGroupIds: [{ id: "E5E7F6C8-7F9C-4B5B-8D5D-9E1E5A4F7E4D" }],
      },
    });
  }
}

// ============================================================================
// Worker Export
// ============================================================================

const provider = new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: UmbracoMcpAgent.serve("/mcp", { binding: "MCP_AGENT" }),
  defaultHandler: createDefaultHandler(options) as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

export default createWorkerExport(provider, options);
