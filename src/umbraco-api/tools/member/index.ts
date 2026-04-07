import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchMembersTool from "./get/search-members.js";
import getMemberTool from "./get/get-member.js";
import listMemberTypesTool from "./get/list-member-types.js";
import createMemberTool from "./post/create-member.js";
import updateMemberTool from "./put/update-member.js";
import deleteMemberTool from "./delete/delete-member.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "member",
    displayName: "Members",
    description: "Search, view, create, update, and delete members",
  },
  tools: () => [searchMembersTool, getMemberTool, listMemberTypesTool, createMemberTool, updateMemberTool, deleteMemberTool],
};

export default collection;
