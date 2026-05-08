import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { extractTextContent, stripHtml } from "../../helpers/tree-walker.js";

const META_DESC_ALIASES = ["metaDescription", "seoMetaDescription", "description"];
const BODY_CONTENT_MAX = 2000;

const inputSchema = {
  id: z.string().uuid().describe("The ID of the content page to audit"),
};

const outputSchema = z.object({
  id: z.string().describe("Page ID"),
  name: z.string().describe("Page name"),
  url: z.string().describe("Page URL"),
  hasMetaDescription: z.boolean().describe("Whether the page has a meta description field with content"),
  bodyWordCount: z.number().describe("Approximate word count of body content"),
  metaDescription: z.string().describe("The meta description value"),
  bodyContent: z.string().describe("First ~2000 characters of extracted body text for alignment analysis"),
  documentType: z.string().describe("The document type name"),
  lastModified: z.string().describe("ISO date string of last modification"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "audit-page-content",
  description: "Retrieve a page's body text alongside its meta description for alignment analysis. Use to identify where the meta description does not reflect the actual content. Returns the first ~2000 characters of body text.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await chainCms("get-document-by-id", { id });
    if (!result.ok) return result.errorResult;
    const doc = result.data;

    const variant = doc.variants?.[0];
    const values = doc.values ?? [];

    const findValue = (aliases: string[]): string => {
      for (const alias of aliases) {
        const found = values.find((v) => v.alias === alias);
        if (found && typeof found.value === "string" && found.value.trim()) {
          return found.value.trim();
        }
      }
      return "";
    };

    const metaDescription = findValue(META_DESC_ALIASES);
    const fullBodyText = extractTextContent(values);
    const bodyContent = fullBodyText.slice(0, BODY_CONTENT_MAX);

    const wordCount = fullBodyText
      ? fullBodyText.split(/\s+/).filter(Boolean).length
      : 0;

    // GetDocumentByIdOutput doesn't include `urls` or documentType.name —
    // they're present at runtime but not in the upstream Zod schema.
    const extra = doc as { urls?: { url?: string }[] };
    const dt = doc.documentType as { name?: string };

    return createToolResult({
      id: doc.id,
      name: variant?.name ?? "Unknown",
      url: extra.urls?.[0]?.url ?? "",
      hasMetaDescription: metaDescription.length > 0,
      bodyWordCount: wordCount,
      metaDescription,
      bodyContent,
      documentType: dt?.name ?? "",
      lastModified: variant?.updateDate ?? "",
    });
  },
};

export default withStandardDecorators(tool);
