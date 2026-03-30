import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import publishPageTool from "./post/publish-page.js";
import unpublishPageTool from "./post/unpublish-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "publishing",
    displayName: "Publishing",
    description: "Publish and unpublish content pages",
    dependencies: ["content"],
  },
  tools: () => [publishPageTool, unpublishPageTool],
};

export default collection;
