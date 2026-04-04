import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportUnusedMediaTool from "./get/report-unused-media.js";
import reportLargeMediaTool from "./get/report-large-media.js";
import reportContentReferencesTool from "./get/report-content-references.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media-health",
    displayName: "Media Health",
    description: "Media library health and usage analysis",
  },
  tools: () => [reportUnusedMediaTool, reportLargeMediaTool, reportContentReferencesTool],
};

export default collection;
