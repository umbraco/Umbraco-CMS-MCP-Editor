import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getPublicAccessTool from "./get/get-public-access.js";
import setPublicAccessTool from "./post/set-public-access.js";
import removePublicAccessTool from "./delete/remove-public-access.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "public-access",
    displayName: "Public Access",
    description: "Manage member-group-based access restrictions on content pages",
  },
  tools: () => [getPublicAccessTool, setPublicAccessTool, removePublicAccessTool],
};

export default collection;
