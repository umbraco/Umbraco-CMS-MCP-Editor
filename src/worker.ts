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
import { tracing } from "cloudflare:workers";
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
  type HostedMcpServerOptions,
  type AuthProps,
  type ChainedServerConsentConfig,
} from "@umbraco-cms/mcp-hosted";
import { umbracoCloudSiteRouting } from "@umbraco-cms/mcp-hosted/cloud";

// Import tool collections and registries (shared with stdio mode via collections.ts)
import { collections, allModes, allModeNames, allSliceNames } from "./collections.js";
import { SERVER_INSTRUCTIONS } from "./server-instructions.js";
import { registerCmsChainedServer } from "./umbraco-api/cms-chained-server.js";
import packageJson from "../package.json" with { type: "json" };

// mcp-dev is loaded on first request, not at startup (see cms-collections-loader.ts)
import { getLoadedCmsCollections, loadCmsCollections, needsCmsCollections } from "./umbraco-api/cms-collections-loader.js";
import { getExpectedUmbracoMajor } from "./config/expected-umbraco-major.js";

// ============================================================================
// Server Configuration
// ============================================================================

// Getters, so mcp-dev's collections are only read at request time (consent
// screen, /info), after the fetch entry below has loaded them.
const cmsChainedServer: ChainedServerConsentConfig = {
  name: "cms",
  displayName: "umbraco-cms-mcp",
  get modeRegistry() { return getLoadedCmsCollections().allModes; },
  get collections() { return getLoadedCmsCollections().collections; },
  get allModeNames() { return getLoadedCmsCollections().allModeNames; },
  get allSliceNames() { return getLoadedCmsCollections().allSliceNames; },
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
// Typed so a misplaced option fails to compile rather than being silently
// dropped by getServerOptions().
const options: HostedMcpServerOptions = {
  name: "umbraco-cms-editor-mcp-hosted",
  version: packageJson.version,
  // This package's major tracks the Umbraco major it targets (18.x on
  // dev/main, 17.x on v17/*). Tags every span with umbraco.mcp.umbraco_major
  // and enables the hosted version check, which folds a mismatch warning into
  // the request's instructions (never blocks). `env.UMBRACO_EXPECTED_MAJOR`
  // overrides it per deployment — mcp-hosted applies that override itself
  // (`env.UMBRACO_EXPECTED_MAJOR ?? options.expectedUmbracoMajor` in
  // create-server.ts), so no override is passed here: `options` is built at
  // module scope with no `env` in hand. See `getExpectedUmbracoMajor`'s own
  // doc comment for the `??` vs `?.trim() ||` gap this leaves (upstream, not
  // fixed here).
  expectedUmbracoMajor: getExpectedUmbracoMajor(),
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
  // Opts into @umbraco-cms/mcp-hosted's span instrumentation (tools/call,
  // mcp.server.init, mcp.auth.refresh). Without it the Worker only emits
  // Cloudflare's automatic spans.
  telemetry: { tracing },
};

const serverOptions = getServerOptions(options);

// ============================================================================
// McpAgent Durable Object
// ============================================================================

export class UmbracoMcpAgent extends McpAgent<HostedMcpEnv, unknown, AuthProps> {
  server!: McpServer;

  async init() {
    // The MCP session id goes on the init span so degraded starts can be
    // traced back to their session. Telemetry only: `getSessionId()` throws
    // when the Durable Object name carries no session id, and that must not
    // stop the server from starting.
    let sessionId: string | undefined;
    try {
      sessionId = this.getSessionId?.();
    } catch (error) {
      console.warn("[mcp-hosted] could not read MCP session id for telemetry:", error);
      sessionId = undefined;
    }
    this.server = await createPerRequestServer(
      serverOptions,
      this.env,
      this.props!,
      sessionId,
    );

    // No setServerRef here: the server ref for elicitation now comes from the
    // per-request store that createPerRequestServer sets up (Umbraco-MCP-Base#384).

    await registerCmsChainedServer();
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

const workerExport = createWorkerExport(provider, options);

export default {
  async fetch(request: Request, env: HostedMcpEnv, ctx: ExecutionContext): Promise<Response> {
    // Load mcp-dev only for requests that read the chained server's config
    // synchronously (see needsCmsCollections). Other requests skip it, and MCP
    // sessions load it themselves in init(). A failed load is logged and the
    // request carries on, so the reader gets the getter's "not loaded" error
    // rather than every route failing. A module that throws on load is caught
    // by the test suite, which imports the real collections, before deploy.
    // Same rule as createDefaultHandler: an explicit option wins, then the env var.
    const consentToolSelection = options.enableConsentToolSelection ?? env.ENABLE_CONSENT_TOOL_SELECTION === "true";
    if (needsCmsCollections(new URL(request.url).pathname, consentToolSelection)) {
      try {
        await loadCmsCollections();
      } catch (error) {
        console.error("[editor-mcp] Failed to load @umbraco-cms/mcp-dev collections:", error);
      }
    }
    return workerExport.fetch(request, env, ctx);
  },
};
