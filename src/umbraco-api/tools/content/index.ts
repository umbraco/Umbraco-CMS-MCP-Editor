import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchContentTool from "./get/search-content.js";
import getPageTool from "./get/get-page.js";
import listChildrenTool from "./get/list-children.js";
import listDocumentTypesTool from "./get/list-document-types.js";
import getDocumentTypeTool from "./get/get-document-type.js";
import inspectBlocksTool from "./get/inspect-blocks.js";
import reportPageReferencesTool from "./get/report-page-references.js";
import compareDraftToPublishedTool from "./get/compare-draft-to-published.js";
import listPageTemplatesTool from "./get/list-page-templates.js";
import getPropertyValueTemplateTool from "./get/get-property-value-template.js";
import createPageTool from "./post/create-page.js";
import duplicatePageTool from "./post/duplicate-page.js";
import addBlocklistBlockTool from "./post/add-blocklist-block.js";
import addBlockgridBlockTool from "./post/add-blockgrid-block.js";
import addRteBlockTool from "./post/add-rte-block.js";
import editPageTool from "./put/edit-page.js";
import editBlockTool from "./put/edit-block.js";
import renamePageTool from "./put/rename-page.js";
import restorePageTool from "./put/restore-page.js";
import sortChildrenTool from "./put/sort-children.js";
import setPageTemplateTool from "./put/set-page-template.js";
import deletePageTool from "./delete/delete-page.js";
import deleteBlockTool from "./delete/delete-block.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content",
    displayName: "Content",
    description: "Search, browse, and manage content pages",
  },
  tools: () => [searchContentTool, getPageTool, listChildrenTool, listDocumentTypesTool, getDocumentTypeTool, inspectBlocksTool, reportPageReferencesTool, compareDraftToPublishedTool, listPageTemplatesTool, getPropertyValueTemplateTool, createPageTool, duplicatePageTool, addBlocklistBlockTool, addBlockgridBlockTool, addRteBlockTool, editPageTool, editBlockTool, renamePageTool, sortChildrenTool, setPageTemplateTool, restorePageTool, deletePageTool, deleteBlockTool],
};

export default collection;
