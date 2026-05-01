import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportStaleContentTool from "./get/report-stale-content.js";
import reportUnpublishedTool from "./get/report-unpublished.js";
import reportRecentlyChangedTool from "./get/report-recently-changed.js";
import reportContentByTypeTool from "./get/report-content-by-type.js";
import reportTranslationCoverageTool from "./get/report-translation-coverage.js";

// Every tool here walks the content tree via walkContentTree (N+1 get-document-by-id
// per page, scanLimit=100, 500 for report-content-by-type). On larger sites the cap
// silently truncates the report — replace with a filtered-pages endpoint when upstream
// support exists.
const collection: ToolCollectionExport = {
  metadata: {
    name: "content-reporting",
    displayName: "Content Reporting",
    description: "Content lifecycle, freshness, and translation reporting",
  },
  tools: () => [
    reportStaleContentTool,
    reportUnpublishedTool,
    reportRecentlyChangedTool,
    reportContentByTypeTool,
    reportTranslationCoverageTool,
  ],
};

export default collection;
