import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listLanguagesTool from "./get/list-languages.js";
import getLanguageTool from "./get/get-language.js";
import createLanguageTool from "./post/create-language.js";
import updateLanguageTool from "./put/update-language.js";
import deleteLanguageTool from "./delete/delete-language.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "language",
    displayName: "Languages",
    description: "Manage languages configured on the Umbraco site",
  },
  tools: () => [listLanguagesTool, getLanguageTool, createLanguageTool, updateLanguageTool, deleteLanguageTool],
};

export default collection;
