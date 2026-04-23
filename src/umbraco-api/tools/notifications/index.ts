import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getContentNotificationsTool from "./get/get-content-notifications.js";
import setContentNotificationsTool from "./put/set-content-notifications.js";
import { isHostedRuntime } from "../helpers/runtime.js";

/**
 * Notifications collection.
 *
 * Tools here target the **current OAuth user's** notification subscriptions.
 * On stdio the server acts as a static API user with no real inbox, so these
 * tools are filtered out at registration time by returning an empty list.
 * In the hosted worker the tools appear and operate as the logged-in editor.
 */
const collection: ToolCollectionExport = {
  metadata: {
    name: "notifications",
    displayName: "Content Notifications",
    description: "Manage per-user email notification subscriptions on content pages (hosted-only)",
  },
  tools: () => isHostedRuntime()
    ? [getContentNotificationsTool, setContentNotificationsTool]
    : [],
};

export default collection;
