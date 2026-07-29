import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getElementTool from "./get/get-element.js";
import listElementChildrenTool from "./get/list-element-children.js";
import searchElementsTool from "./get/search-elements.js";
import inspectElementBlocksTool from "./get/inspect-element-blocks.js";
import createElementTool from "./post/create-element.js";
import createElementFolderTool from "./post/create-element-folder.js";
import publishElementTool from "./post/publish-element.js";
import unpublishElementTool from "./post/unpublish-element.js";
import editElementTool from "./put/edit-element.js";
import editElementBlockTool from "./put/edit-element-block.js";
import deleteElementTool from "./delete/delete-element.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "element",
    displayName: "Library Elements",
    description: "Browse, view, edit (including blocks), publish, and organise reusable Library elements (Umbraco 18 Library section)",
  },
  tools: () => [
    getElementTool,
    listElementChildrenTool,
    searchElementsTool,
    inspectElementBlocksTool,
    createElementTool,
    createElementFolderTool,
    editElementTool,
    editElementBlockTool,
    publishElementTool,
    unpublishElementTool,
    deleteElementTool,
  ],
};

export default collection;
