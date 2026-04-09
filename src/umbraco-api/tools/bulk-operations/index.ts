import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import bulkPublishTool from "./post/bulk-publish.js";
import bulkUnpublishTool from "./post/bulk-unpublish.js";
import bulkSchedulePublishTool from "./post/bulk-schedule-publish.js";
import bulkSetPropertyTool from "./post/bulk-set-property.js";
import bulkMoveTool from "./post/bulk-move.js";
import bulkSetBlockPropertyTool from "./post/bulk-set-block-property.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "bulk-operations",
    displayName: "Bulk Operations",
    description: "Safe bulk content operations with confirmation and rollback support",
  },
  tools: () => [bulkPublishTool, bulkUnpublishTool, bulkSchedulePublishTool, bulkSetPropertyTool, bulkMoveTool, bulkSetBlockPropertyTool],
};

export default collection;
