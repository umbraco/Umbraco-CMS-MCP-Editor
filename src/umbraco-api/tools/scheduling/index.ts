import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getPublishStatusTool from "./get/get-publish-status.js";
import listScheduledContentTool from "./get/list-scheduled-content.js";
import schedulePublishTool from "./post/schedule-publish.js";
import cancelScheduleTool from "./post/cancel-schedule.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "scheduling",
    displayName: "Scheduling",
    description: "View and manage scheduled content publishing",
  },
  // list-scheduled-content walks the content tree (scanLimit=100). Acceptable for
  // small sites; large sites need a filtered-pages endpoint upstream.
  tools: () => [getPublishStatusTool, listScheduledContentTool, schedulePublishTool, cancelScheduleTool],
};

export default collection;
