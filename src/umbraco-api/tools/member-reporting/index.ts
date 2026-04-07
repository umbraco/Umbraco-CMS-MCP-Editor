import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportMemberCountTool from "./get/report-member-count.js";
import reportMembersByGroupTool from "./get/report-members-by-group.js";
import reportMemberActivityTool from "./get/report-member-activity.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "member-reporting",
    displayName: "Member Reporting",
    description: "Member analytics and reporting",
  },
  tools: () => [reportMemberCountTool, reportMembersByGroupTool, reportMemberActivityTool],
};

export default collection;
