import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportLargeMediaTool from "./get/report-large-media.js";

// report-large-media walks the media tree via walkMediaTree (scanLimit=100). On
// larger libraries the cap silently truncates — replace with a filtered-media
// endpoint when upstream support exists.
const collection: ToolCollectionExport = {
  metadata: {
    name: "media-health",
    displayName: "Media Health",
    description: "Media library health and usage analysis",
  },
  tools: () => [reportLargeMediaTool],
};

export default collection;
