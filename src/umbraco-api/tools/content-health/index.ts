import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import auditPageSeoTool from "./get/audit-page-seo.js";
import auditPageContentTool from "./get/audit-page-content.js";
import reportEmptyFieldsTool from "./get/report-empty-fields.js";
import reportShortContentTool from "./get/report-short-content.js";
import reportMediaMissingAltTool from "./get/report-media-missing-alt.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content-health",
    displayName: "Content Health",
    description: "Content quality auditing and SEO analysis",
  },
  tools: () => [auditPageSeoTool, auditPageContentTool, reportEmptyFieldsTool, reportShortContentTool, reportMediaMissingAltTool],
};

export default collection;
