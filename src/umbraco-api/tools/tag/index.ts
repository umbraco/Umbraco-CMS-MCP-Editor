import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listTagsTool from "./get/list-tags.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "tag",
    displayName: "Tags",
    description: "Browse tags in use across the site",
  },
  tools: () => [listTagsTool],
};

export default collection;
