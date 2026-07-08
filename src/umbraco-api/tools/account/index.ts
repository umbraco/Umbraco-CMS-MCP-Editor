import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getCurrentUserTool from "./get/get-current-user.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "account",
    displayName: "Account",
    description: "Identify the Umbraco backoffice user this MCP server is authenticated as",
  },
  tools: () => [getCurrentUserTool],
};

export default collection;
