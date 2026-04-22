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
  // report-empty-fields, report-short-content, and report-media-missing-alt walk the
  // content/media tree (N+1 get-document-by-id, scanLimit=100) and are disabled until a
  // filtered-pages endpoint is available. Imports kept so the tool files still type-check.
  // Full list: [auditPageSeoTool, auditPageContentTool, reportEmptyFieldsTool, reportShortContentTool, reportMediaMissingAltTool]
  tools: () => [auditPageSeoTool, auditPageContentTool],
};

export default collection;
