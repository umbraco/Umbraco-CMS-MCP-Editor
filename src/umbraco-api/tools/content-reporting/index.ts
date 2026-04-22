import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportStaleContentTool from "./get/report-stale-content.js";
import reportUnpublishedTool from "./get/report-unpublished.js";
import reportRecentlyChangedTool from "./get/report-recently-changed.js";
import reportContentByTypeTool from "./get/report-content-by-type.js";
import reportTranslationCoverageTool from "./get/report-translation-coverage.js";

// DISABLED at collection level: every tool here walks the content tree via walkContentTree,
// which fires get-document-by-id per page (N+1) and is capped at scanLimit=100 (500 for
// report-content-by-type). On any non-trivial site these reports silently truncate and are
// too slow to be useful. Re-enable once a dedicated filtered-pages endpoint bypasses the
// tree walk. Imports kept so the tool files still type-check.
const collection: ToolCollectionExport = {
  metadata: {
    name: "content-reporting",
    displayName: "Content Reporting",
    description: "Content lifecycle, freshness, and translation reporting",
  },
  // tools: () => [reportStaleContentTool, reportUnpublishedTool, reportRecentlyChangedTool, reportContentByTypeTool, reportTranslationCoverageTool],
  tools: () => [],
};

export default collection;
