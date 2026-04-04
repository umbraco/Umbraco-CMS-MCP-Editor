import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportStaleContentTool from "./get/report-stale-content.js";
import reportUnpublishedTool from "./get/report-unpublished.js";
import reportRecentlyChangedTool from "./get/report-recently-changed.js";
import reportContentByTypeTool from "./get/report-content-by-type.js";
import reportTranslationCoverageTool from "./get/report-translation-coverage.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content-reporting",
    displayName: "Content Reporting",
    description: "Content lifecycle, freshness, and translation reporting",
  },
  tools: () => [reportStaleContentTool, reportUnpublishedTool, reportRecentlyChangedTool, reportContentByTypeTool, reportTranslationCoverageTool],
};

export default collection;
