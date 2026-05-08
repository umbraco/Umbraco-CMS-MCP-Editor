import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listVersionsTool from "./get/list-versions.js";
import getPageChangeHistoryTool from "./get/get-page-change-history.js";
import rollbackPageTool from "./post/rollback-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "versioning",
    displayName: "Version History",
    description: "View version history, change history, and rollback to previous versions",
    dependencies: ["content"],
  },
  tools: () => [listVersionsTool, getPageChangeHistoryTool, rollbackPageTool],
};

export default collection;
