import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listMemberGroupsTool from "./get/list-member-groups.js";
import createMemberGroupTool from "./post/create-member-group.js";
import deleteMemberGroupTool from "./delete/delete-member-group.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "member-group",
    displayName: "Member Groups",
    description: "Manage member groups for organising members",
  },
  tools: () => [listMemberGroupsTool, createMemberGroupTool, deleteMemberGroupTool],
};

export default collection;
