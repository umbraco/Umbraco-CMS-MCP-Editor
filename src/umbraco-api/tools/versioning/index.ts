import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listVersionsTool from "./get/list-versions.js";
import rollbackPageTool from "./post/rollback-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "versioning",
    displayName: "Version History",
    description: "View version history and rollback to previous versions",
    dependencies: ["content"],
  },
  tools: () => [listVersionsTool, rollbackPageTool],
};

export default collection;
