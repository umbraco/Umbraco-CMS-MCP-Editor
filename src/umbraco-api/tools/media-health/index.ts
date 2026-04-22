import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportLargeMediaTool from "./get/report-large-media.js";

// DISABLED at collection level: the only tool here (report-large-media) walks the media
// tree via walkMediaTree and is capped at scanLimit=100, so it silently truncates on any
// non-trivial library. Re-enable once a dedicated filtered-media endpoint bypasses the
// tree walk. Import kept so the tool file still type-checks.
const collection: ToolCollectionExport = {
  metadata: {
    name: "media-health",
    displayName: "Media Health",
    description: "Media library health and usage analysis",
  },
  // tools: () => [reportLargeMediaTool],
  tools: () => [],
};

export default collection;
