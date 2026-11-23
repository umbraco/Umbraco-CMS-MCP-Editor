/**
 * In-Process CMS for Tests
 *
 * Overrides mcpClientManager.callTool("cms", ...) to dispatch directly to
 * CMS tool handlers in-process, bypassing StdioClientTransport entirely.
 *
 * The tool map is built lazily on first CMS call and cached on `process`
 * so it persists across Jest VM contexts without re-importing per suite.
 */

import { createPermissiveCodegenUser, type McpClientManager } from "@umbraco-cms/mcp-server-sdk";
import { createMockRequestHandlerExtra } from "@umbraco-cms/mcp-server-sdk/testing";

// The in-process CMS map must expose EVERY chainable CMS tool — a hardcoded
// section/permission list silently drops any tool behind a section a new
// Umbraco major adds (e.g. Umbraco 18's `Umb.Section.Library` / Elements
// domain, which a fixed list omitted). Use the SDK's permission-complete
// codegen user so the map stays exhaustive as the CMS surface grows.
const permissiveUser = createPermissiveCodegenUser();

/** Build the CMS tool map lazily. Cached on `process` across VM contexts. */
async function getCmsToolMap(): Promise<Map<string, any>> {
  if ((process as any).__cmsToolMap) {
    return (process as any).__cmsToolMap;
  }

  // Dynamic import — only happens once (Node's ESM loader caches modules).
  // Cast to `any` for the SDK re-exports; the hand-maintained collections.d.ts
  // in cms-dev doesn't declare them yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collectionsModule = (await import("@umbraco-cms/mcp-dev/collections")) as any;
  const { collections, UmbracoManagementClient } = collectionsModule;
  const sdk = await import("@umbraco-cms/mcp-server-sdk");

  // Prefer the re-exports from cms-dev's collections when available — this hits
  // the right SDK singleton when cms-dev is linked locally (which carries its
  // own SDK copy in node_modules). Fall back to the editor MCP's SDK for the
  // published cms-dev package, where the two share the hoisted SDK anyway.
  const initializeUmbracoFetch = collectionsModule.initializeUmbracoFetch ?? sdk.initializeUmbracoFetch;
  const configureApiClient = collectionsModule.configureApiClient ?? sdk.configureApiClient;

  initializeUmbracoFetch({
    clientId: process.env.UMBRACO_CLIENT_ID ?? "",
    clientSecret: process.env.UMBRACO_CLIENT_SECRET ?? "",
    baseUrl: process.env.UMBRACO_BASE_URL ?? "https://localhost:44391",
  });
  configureApiClient(() => UmbracoManagementClient.getClient());

  const buildToolMap = (umbracoVersion?: string) => {
    const map = new Map<string, any>();
    for (const collection of collections) {
      const tools = typeof collection.tools === "function"
        ? collection.tools(permissiveUser, { umbracoVersion })
        : collection.tools;
      for (const tool of tools) {
        map.set(tool.name, tool);
      }
    }
    return map;
  };

  // mcp-dev gates tools on the connected Umbraco's minor (e.g. 18.1's
  // update-and-publish-document) and lists the legacy variants when it doesn't
  // know the version. The real stdio subprocess and hosted both supply it, so
  // do the same here: read it with get-server-information, then rebuild.
  let toolMap = buildToolMap();
  const umbracoVersion = await readUmbracoVersion(toolMap.get("get-server-information"));
  if (umbracoVersion) {
    collectionsModule.setUmbracoVersion?.(umbracoVersion);
    toolMap = buildToolMap(umbracoVersion);
  }

  (process as any).__cmsToolMap = toolMap;
  return toolMap;
}

/** The connected Umbraco's version, or undefined if it can't be read. */
async function readUmbracoVersion(tool: any): Promise<string | undefined> {
  if (!tool) return undefined;
  try {
    const result = await tool.handler({}, createMockRequestHandlerExtra());
    if (result?.isError) return undefined;
    const data = result?.structuredContent ?? JSON.parse(result?.content?.[0]?.text ?? "{}");
    return typeof data?.version === "string" ? data.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Override the manager's callTool to dispatch CMS calls in-process.
 */
export function connectInProcess(manager: McpClientManager): void {
  const originalCallTool = manager.callTool.bind(manager);

  manager.callTool = async function (serverName: string, toolName: string, args?: Record<string, unknown>) {
    if (serverName !== "cms") {
      return originalCallTool(serverName, toolName, args ?? {});
    }

    const cmsToolMap = await getCmsToolMap();
    const tool = cmsToolMap.get(toolName);
    if (!tool) {
      return {
        content: [{ type: "text" as const, text: `Unknown CMS tool: ${toolName}` }],
        isError: true,
      };
    }

    try {
      const extra = createMockRequestHandlerExtra();
      const result = await tool.handler(args ?? {}, extra);
      return result;
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: error.message ?? String(error) }],
        isError: true,
      };
    }
  } as typeof manager.callTool;
}
