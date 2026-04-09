import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportContentReferencesTool from "./get/report-content-references.js";
import reportOrphanPagesTool from "./get/report-orphan-pages.js";
import reportUnusedMediaTool from "./get/report-unused-media.js";
import reportOutboundLinksTool from "./get/report-outbound-links.js";
import reportMostReferencedTool from "./get/report-most-referenced.js";
import reportRelationshipMapTool from "./get/report-relationship-map.js";
import reportExternalLinksTool from "./get/report-external-links.js";

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
    reportOutboundLinksTool,
    reportMostReferencedTool,
    reportRelationshipMapTool,
    reportExternalLinksTool,
  ],
};

export default collection;
