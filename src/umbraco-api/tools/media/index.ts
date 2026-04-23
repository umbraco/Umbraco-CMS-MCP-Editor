import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchMediaTool from "./get/search-media.js";
import listMediaChildrenTool from "./get/list-media-children.js";
import getMediaTool from "./get/get-media.js";
import listMediaTypesTool from "./get/list-media-types.js";
import getMediaTypeTool from "./get/get-media-type.js";
import reportMediaReferencesTool from "./get/report-media-references.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media",
    displayName: "Media",
    description: "Browse, search, and view media items",
  },
  tools: () => [searchMediaTool, listMediaChildrenTool, getMediaTool, listMediaTypesTool, getMediaTypeTool, reportMediaReferencesTool],
};

export default collection;
