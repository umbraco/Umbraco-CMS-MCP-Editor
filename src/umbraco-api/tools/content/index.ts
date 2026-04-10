import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchContentTool from "./get/search-content.js";
import getPageTool from "./get/get-page.js";
import listChildrenTool from "./get/list-children.js";
import listDocumentTypesTool from "./get/list-document-types.js";
import inspectBlocksTool from "./get/inspect-blocks.js";
import createPageTool from "./post/create-page.js";
import editPageTool from "./put/edit-page.js";
import editBlockTool from "./put/edit-block.js";
import restorePageTool from "./put/restore-page.js";
import deletePageTool from "./delete/delete-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content",
    displayName: "Content",
    description: "Search, browse, and manage content pages",
  },
  tools: () => [searchContentTool, getPageTool, listChildrenTool, listDocumentTypesTool, inspectBlocksTool, createPageTool, editPageTool, editBlockTool, restorePageTool, deletePageTool],
};

export default collection;
