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

  // Dynamic import — only happens once (Node's ESM loader caches modules)
  const { collections, UmbracoManagementClient } = await import("@umbraco-cms/mcp-dev/collections");
  const sdk = await import("@umbraco-cms/mcp-server-sdk");

  sdk.initializeUmbracoAxios({
    clientId: process.env.UMBRACO_CLIENT_ID ?? "",
    clientSecret: process.env.UMBRACO_CLIENT_SECRET ?? "",
    baseUrl: process.env.UMBRACO_BASE_URL ?? "https://localhost:44391",
  });
  sdk.configureApiClient(() => UmbracoManagementClient.getClient());

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
