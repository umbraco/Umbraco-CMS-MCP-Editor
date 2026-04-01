import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchContentTool from "./get/search-content.js";
import getPageTool from "./get/get-page.js";
import listChildrenTool from "./get/browse-children.js";
import listDocumentTypesTool from "./get/list-document-types.js";
import createPageTool from "./post/create-page.js";
import editPageTool from "./put/edit-page.js";
import deletePageTool from "./delete/delete-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content",
    displayName: "Content",
    description: "Search, browse, and manage content pages",
  },
  tools: () => [searchContentTool, getPageTool, listChildrenTool, listDocumentTypesTool, createPageTool, editPageTool, deletePageTool],
};

export default collection;
