import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getElementTool from "./get/get-element.js";
import createElementTool from "./post/create-element.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "element",
    displayName: "Library Elements",
    description: "Browse, view, and manage reusable Library elements (Umbraco 18 Library section)",
  },
  tools: () => [getElementTool, createElementTool],
};

export default collection;
