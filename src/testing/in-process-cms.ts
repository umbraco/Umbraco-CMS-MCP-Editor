/**
 * In-Process CMS for Tests
 *
 * Overrides mcpClientManager.callTool("cms", ...) to dispatch directly to
 * CMS tool handlers in-process, bypassing StdioClientTransport entirely.
 *
 * The tool map is built lazily on first CMS call and cached on `process`
 * so it persists across Jest VM contexts without re-importing per suite.
 */

import { type McpClientManager } from "@umbraco-cms/mcp-server-sdk";
import { createMockRequestHandlerExtra } from "@umbraco-cms/mcp-server-sdk/testing";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { findPackageJSON } from "node:module";
import path from "node:path";

/**
 * Some CMS tools are gated behind `isUmbracoAtLeast(major, minor)` — a runtime
 * check backed by a module-private variable that mcp-dev's own `main()` sets
 * via `setUmbracoVersion(serverInfo.version)` during a real server bootstrap.
 * That setter isn't re-exported from the package's public entry points, so
 * without this, every version-gated tool reads as "unknown" in-process
 * regardless of the connected instance's actual version (see
 * scripts/capture-cms-tool-surface.mjs's isUmbracoAtLeast warning for the
 * same gap affecting the audit-diff script).
 *
 * `collections.js` itself imports from an internal, content-hashed chunk file
 * that happens to export `setUmbracoVersion` without re-exporting it further —
 * so resolve collections.js's own source to find whichever chunk it imports
 * (never hardcode the hash; it changes every mcp-dev build) and reach in
 * directly. Best-effort: if this internal shape ever changes, we just fall
 * back to leaving version-gated tools unavailable in-process, never a broken
 * build — remove this shim once mcp-dev exports a public version setter.
 */
async function resolveSetUmbracoVersion(): Promise<((version: string) => void) | null> {
  try {
    // `import.meta.resolve` isn't implemented under Jest's --experimental-vm-modules
    // loader, so locate the package root the same way src/config/mcp-servers.ts
    // does for its bin entry, then read the "./collections" export path by hand.
    const pkgPath = findPackageJSON("@umbraco-cms/mcp-dev", import.meta.url);
    if (!pkgPath) return null;
    const pkgDir = path.dirname(pkgPath);
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      exports?: Record<string, { import?: string } | string>;
    };
    const collectionsExport = pkg.exports?.["./collections"];
    const collectionsRelPath = typeof collectionsExport === "string" ? collectionsExport : collectionsExport?.import;
    if (!collectionsRelPath) return null;
    const collectionsPath = path.resolve(pkgDir, collectionsRelPath);
    const collectionsUrl = pathToFileURL(collectionsPath).href;

    const src = await readFile(collectionsPath, "utf8");
    const match = src.match(/from\s+["'](\.\/chunk-[^"']+\.js)["']/);
    if (!match) return null;
    const chunkUrl = new URL(match[1], collectionsUrl).href;
    const chunkModule = (await import(chunkUrl)) as Record<string, unknown>;
    return typeof chunkModule.setUmbracoVersion === "function"
      ? (chunkModule.setUmbracoVersion as (version: string) => void)
      : null;
  } catch {
    return null;
  }
}

const permissiveUser = {
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
};

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

  // Mirror mcp-dev's own main(): fetch the connected instance's real version
  // and set it, so isUmbracoAtLeast(...)-gated tools register in-process too.
  const setUmbracoVersion = await resolveSetUmbracoVersion();
  if (setUmbracoVersion) {
    try {
      const info = await UmbracoManagementClient.getClient().getServerInformation();
      setUmbracoVersion(info.version);
    } catch {
      // Best-effort — if the live instance can't be reached yet, version-gated
      // tools just stay unavailable in-process rather than failing the build.
    }
  }

  const toolMap = new Map<string, any>();
  for (const collection of collections) {
    const tools = typeof collection.tools === "function"
      ? collection.tools(permissiveUser)
      : collection.tools;
    for (const tool of tools) {
      toolMap.set(tool.name, tool);
    }
  }

  (process as any).__cmsToolMap = toolMap;
  return toolMap;
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
