import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import createVariantTool from "./post/create-variant.js";
import copyVariantTool from "./post/copy-variant.js";
import listUntranslatedTool from "./get/list-untranslated.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "translation",
    displayName: "Translation",
    description: "Create and manage language variants for content pages",
  },
  tools: () => [createVariantTool, copyVariantTool, listUntranslatedTool],
};

export default collection;
