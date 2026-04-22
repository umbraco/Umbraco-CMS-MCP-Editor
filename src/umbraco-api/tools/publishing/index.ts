import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import publishPageTool from "./post/publish-page.js";
import unpublishPageTool from "./post/unpublish-page.js";
import saveAndPublishTool from "./post/save-and-publish.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "publishing",
    displayName: "Publishing",
    description: "Publish and unpublish content pages",
    dependencies: ["content"],
  },
  tools: () => [publishPageTool, unpublishPageTool, saveAndPublishTool],
};

export default collection;
