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
  createSiteRoutingApiHandler,
  createWorkerExport,
  createPerRequestServer,
  getServerOptions,
  type HostedMcpEnv,
  type AuthProps,
  type ChainedServerConsentConfig,
} from "@umbraco-cms/mcp-hosted";
import { umbracoCloudSiteRouting } from "@umbraco-cms/mcp-hosted/cloud";

// Import tool collections and registries (shared with stdio mode via collections.ts)
import { collections, allModes, allModeNames, allSliceNames } from "./collections.js";
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";
import { createPermissiveCodegenUser, setServerRef } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "./umbraco-api/mcp-client.js";
import { setHumanInTheLoopOverride } from "./umbraco-api/tools/helpers/human-in-the-loop.js";

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

// Umbraco Cloud multi-tenancy.
// Wired unconditionally; the lib gates engagement at request time via
// siteRouting.enabled?(env). The Cloud preset defaults that to
// (env) => env.UMBRACO_CLOUD_ROUTING_ENABLED === "true", so multi-tenant mode
// is flipped from wrangler.toml [vars] without a source edit.
// When engaged, the MCP endpoint becomes /at/{alias}/ (where {alias} is the
// Cloud project alias) and per-request URLs resolve to
// https://{alias}.{region}.umbraco.io. Region defaults to
// env.UMBRACO_CLOUD_REGION or "euwest01".
// Each Cloud project must register an OAuth client with the id below.
const options = {
  name: "umbraco-cms-editor-mcp-hosted",
  version: "1.0.0",
  instructions: SERVER_INSTRUCTIONS,
  collections,
  modeRegistry: allModes,
  allModeNames,
  allSliceNames,
  enableConsentToolSelection: false,
  authOptions: { showReauthButton: true },
  chainedServers: [cmsChainedServer],
  siteRouting: umbracoCloudSiteRouting({
    oauthClientId: "umbraco-cms-editor-mcp-hosted",
  }),
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

    // Mirrors UMBRACO_READONLY: read directly off the Worker's env binding
    // (HostedMcpEnv doesn't declare this field, so it's not a plain vars
    // passthrough elsewhere), not process.env — a Durable Object's
    // tool-handler execution context doesn't reliably reflect vars the way
    // module-scope code does.
    const humanInTheLoopEnv = (this.env as unknown as Record<string, string | undefined>).UMBRACO_HUMAN_IN_THE_LOOP;
    setHumanInTheLoopOverride(
      humanInTheLoopEnv === "false" ? false : humanInTheLoopEnv === "true" ? true : undefined
    );

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
      // Permission-complete mock user so every CMS tool's enabled() check passes
      // and no tool is dropped when a new Umbraco major adds a section/permission
      // family (e.g. Umbraco 18's Library / Elements domain). Real user auth is
      // handled by the OAuth/token layer, not here.
      user: createPermissiveCodegenUser(),
    });
  }
}

// ============================================================================
// Worker Export
// ============================================================================

const provider = new OAuthProvider({
  apiRoute: ["/mcp", "/at/"],
  apiHandler: createSiteRoutingApiHandler(
    UmbracoMcpAgent.serve("/mcp", { binding: "MCP_AGENT" })
  ),
  defaultHandler: createDefaultHandler(options) as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

export default createWorkerExport(provider, options);
