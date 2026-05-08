import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportContentReferencesTool from "./get/report-content-references.js";
import reportOutboundLinksTool from "./get/report-outbound-links.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "relationships",
    displayName: "Content Relationships",
    description: "Inbound references and outbound links",
  },
  tools: () => [reportContentReferencesTool, reportOutboundLinksTool],
};

export default collection;
