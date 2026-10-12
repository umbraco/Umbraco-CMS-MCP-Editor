/**
 * Registers mcp-dev as an in-process "cms" server on mcpClientManager, so
 * editor tools can call mcpClientManager.callTool("cms", ...) on hosted.
 *
 * Called from worker.ts init() for every session, and from the
 * session-isolation test so it exercises the same registration.
 */
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
    // Pass a permissive user so CMS tool enabled() checks pass.
    // The real user auth is handled by the OAuth/token layer.
    // Permissive mock user so all CMS tool enabled() checks pass.
    // Real user auth is handled by the OAuth/token layer.
    user: {
      fallbackPermissions: [
        "Umb.Document.Create", "Umb.Document.Read", "Umb.Document.Update",
        "Umb.Document.Delete", "Umb.Document.Publish", "Umb.Document.Unpublish",
        "Umb.Document.Move", "Umb.Document.Sort", "Umb.Document.Duplicate",
        "Umb.Document.PublicAccess",
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
