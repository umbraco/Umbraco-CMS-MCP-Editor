import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportSiteTreeSummaryTool from "./get/report-site-tree-summary.js";
import reportOrphanPagesTool from "./get/report-orphan-pages.js";
import reportDeepPagesTool from "./get/report-deep-pages.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "site-structure",
    displayName: "Site Structure",
    description: "Site architecture analysis and structure reporting",
  },
  tools: () => [reportSiteTreeSummaryTool, reportOrphanPagesTool, reportDeepPagesTool],
};

export default collection;
