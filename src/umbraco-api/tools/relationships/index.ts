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
  // report-orphan-pages walks the content tree (N+1 get-document-by-id, scanLimit=100)
  // and is disabled until a filtered-pages endpoint is available. Import kept so the tool
  // file still type-checks.
  // Full list: [reportContentReferencesTool, reportOrphanPagesTool, reportOutboundLinksTool]
  tools: () => [
    reportContentReferencesTool,
    reportOutboundLinksTool,
  ],
};

export default collection;
