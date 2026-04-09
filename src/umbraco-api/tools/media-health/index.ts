import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportLargeMediaTool from "./get/report-large-media.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media-health",
    displayName: "Media Health",
    description: "Media library health and usage analysis",
  },
  tools: () => [reportLargeMediaTool],
};

export default collection;
