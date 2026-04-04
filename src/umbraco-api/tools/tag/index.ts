import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getTagsTool from "./get/get-tags.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "tag",
    displayName: "Tags",
    description: "Browse tags in use across the site",
  },
  tools: () => [getTagsTool],
};

export default collection;
