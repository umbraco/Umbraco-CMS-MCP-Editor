import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchContentTool from "./get/search-content.js";
import getPageTool from "./get/get-page.js";
import listChildrenTool from "./get/list-children.js";
import listDocumentTypesTool from "./get/list-document-types.js";
import getDocumentTypeTool from "./get/get-document-type.js";
import inspectBlocksTool from "./get/inspect-blocks.js";
import reportPageReferencesTool from "./get/report-page-references.js";
import createPageTool from "./post/create-page.js";
import duplicatePageTool from "./post/duplicate-page.js";
import editPageTool from "./put/edit-page.js";
import editBlockTool from "./put/edit-block.js";
import restorePageTool from "./put/restore-page.js";
import sortChildrenTool from "./put/sort-children.js";
import deletePageTool from "./delete/delete-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content",
    displayName: "Content",
    description: "Search, browse, and manage content pages",
  },
  tools: () => [searchContentTool, getPageTool, listChildrenTool, listDocumentTypesTool, getDocumentTypeTool, inspectBlocksTool, reportPageReferencesTool, createPageTool, duplicatePageTool, editPageTool, editBlockTool, sortChildrenTool, restorePageTool, deletePageTool],
};

export default collection;
