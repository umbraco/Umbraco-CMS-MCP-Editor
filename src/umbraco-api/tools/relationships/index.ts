import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportContentReferencesTool from "./get/report-content-references.js";
import reportOrphanPagesTool from "./get/report-orphan-pages.js";
import reportOutboundLinksTool from "./get/report-outbound-links.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "relationships",
    displayName: "Content Relationships",
    description: "Inbound references, outbound links, and relationship mapping",
  },
  tools: () => [
    reportContentReferencesTool,
    reportOrphanPagesTool,
    reportOutboundLinksTool,
  ],
};

export default collection;
