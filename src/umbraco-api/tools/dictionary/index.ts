import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listDictionaryTool from "./get/list-dictionary.js";
import searchDictionaryTool from "./get/search-dictionary.js";
import getDictionaryTool from "./get/get-dictionary.js";
import createDictionaryTool from "./post/create-dictionary.js";
import updateDictionaryTool from "./put/update-dictionary.js";
import moveDictionaryTool from "./put/move-dictionary.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "dictionary",
    displayName: "Dictionary",
    description: "Manage translation dictionary entries for UI labels and static text",
  },
  tools: () => [listDictionaryTool, searchDictionaryTool, getDictionaryTool, createDictionaryTool, updateDictionaryTool, moveDictionaryTool],
};

export default collection;
