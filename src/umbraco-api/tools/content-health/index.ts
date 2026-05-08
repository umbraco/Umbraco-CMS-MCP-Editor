import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import auditPageSeoTool from "./get/audit-page-seo.js";
import auditPageContentTool from "./get/audit-page-content.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content-health",
    displayName: "Content Health",
    description: "Per-page content quality auditing and SEO analysis",
  },
  tools: () => [auditPageSeoTool, auditPageContentTool],
};

export default collection;
