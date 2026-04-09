import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportContentReferencesTool from "./get/report-content-references.js";
import reportOrphanPagesTool from "./get/report-orphan-pages.js";
import reportUnusedMediaTool from "./get/report-unused-media.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "relationships",
    displayName: "Content Relationships",
    description: "Inbound references, outbound links, relationship mapping, and external URL inventory",
  },
  tools: () => [
    reportContentReferencesTool,
    reportOrphanPagesTool,
    reportUnusedMediaTool,
  ],
};

export default collection;
