import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listRedirectsTool from "./get/list-redirects.js";
import getRedirectTool from "./get/get-redirect.js";
import getRedirectStatusTool from "./get/get-redirect-status.js";
import deleteRedirectTool from "./delete/delete-redirect.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "redirect",
    displayName: "Redirects",
    description: "View and manage URL redirects",
  },
  tools: () => [listRedirectsTool, getRedirectTool, getRedirectStatusTool, deleteRedirectTool],
};

export default collection;
