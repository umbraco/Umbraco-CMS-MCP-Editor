import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listRecycleBinTool from "./get/list-recycle-bin.js";
import permanentDeleteRecycleBinItemTool from "./delete/permanent-delete-recycle-bin-item.js";
import emptyRecycleBinTool from "./delete/empty-recycle-bin.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "recycle-bin",
    displayName: "Recycle Bin",
    description: "List the content or media recycle bin and permanently delete items or empty the bin (irreversible)",
  },
  tools: () => [listRecycleBinTool, permanentDeleteRecycleBinItemTool, emptyRecycleBinTool],
};

export default collection;
