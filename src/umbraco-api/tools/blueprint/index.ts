import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listBlueprintsTool from "./get/list-blueprints.js";
import getBlueprintTool from "./get/get-blueprint.js";
import createBlueprintTool from "./post/create-blueprint.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "blueprint",
    displayName: "Blueprints",
    description: "List, view, and create page blueprints",
  },
  tools: () => [listBlueprintsTool, getBlueprintTool, createBlueprintTool],
};

export default collection;
