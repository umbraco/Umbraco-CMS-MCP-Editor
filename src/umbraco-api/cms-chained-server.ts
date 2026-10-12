/**
 * Registers mcp-dev as an in-process "cms" server on mcpClientManager, so
 * editor tools can call mcpClientManager.callTool("cms", ...) on hosted.
 *
 * Called from worker.ts init() for every session, and from the
 * session-isolation test so it exercises the same registration.
 */
import { createPermissiveCodegenUser } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "./mcp-client.js";
import {
  collections as cmsCollections,
  allModes as cmsModes,
  allModeNames as cmsModeNames,
  allSliceNames as cmsSliceNames,
  UmbracoManagementClient as CmsClient,
} from "@umbraco-cms/mcp-dev/collections";

export function registerCmsChainedServer(): void {
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
