import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { extractHeadings, extractImages, countWords, extractTextContent, stripHtml } from "../../helpers/tree-walker.js";

const TITLE_ALIASES = ["pageTitle", "title", "metaTitle", "seoTitle"];
const META_DESC_ALIASES = ["metaDescription", "seoMetaDescription", "description"];

const inputSchema = {
  id: z.string().uuid().describe("The ID of the content page to audit"),
};

const outputSchema = z.object({
  id: z.string().describe("Page ID"),
  name: z.string().describe("Page name"),
  url: z.string().describe("Page URL"),
  hasTitle: z.boolean().describe("Whether the page has a title field with content"),
  hasMetaDescription: z.boolean().describe("Whether the page has a meta description field with content"),
  metaDescriptionLength: z.number().describe("Character count of the meta description"),
  titleLength: z.number().describe("Character count of the title"),
  headingCount: z.number().describe("Number of headings found in body content"),
  imagesWithoutAlt: z.number().describe("Number of images missing alt text"),
  totalImages: z.number().describe("Total number of images found in body content"),
  bodyWordCount: z.number().describe("Approximate word count of body content"),
  title: z.string().describe("The page title value"),
  metaDescription: z.string().describe("The meta description value"),
  headings: z.array(z.object({ level: z.number(), text: z.string() })).describe("Headings found in body content"),
  images: z.array(z.object({ src: z.string(), alt: z.string(), hasAlt: z.boolean() })).describe("Images found in body content with alt text status"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "audit-page-seo",
  description: "Audit a page's SEO health. Returns title, meta description, headings, images with alt text status, and word count. Includes flags for quick scanning and raw data for detailed analysis. Use with analytics data to prioritise high-traffic pages.",
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

    const title = findValue(TITLE_ALIASES);
    const metaDescription = findValue(META_DESC_ALIASES);

    // Collect all HTML string values for heading/image extraction
    const allHtml = values
      .filter((v) => typeof v.value === "string" && /<[a-z]/i.test(v.value))
      .map((v) => v.value as string)
      .join("\n");

    const headings = extractHeadings(allHtml);
    const images = extractImages(allHtml);
    const bodyWordCount = countWords(extractTextContent(values));

    // GetDocumentByIdOutput doesn't include `urls` — runtime field, not in the upstream Zod schema.
    const extra = doc as { urls?: { url?: string }[] };

    return createToolResult({
      id: doc.id,
      name: variant?.name ?? "Unknown",
      url: extra.urls?.[0]?.url ?? "",
      hasTitle: title.length > 0,
      hasMetaDescription: metaDescription.length > 0,
      titleLength: title.length,
      metaDescriptionLength: metaDescription.length,
      headingCount: headings.length,
      imagesWithoutAlt: images.filter((img) => !img.hasAlt).length,
      totalImages: images.length,
      bodyWordCount,
      title,
      metaDescription,
      headings,
      images,
    });
  },
};

export default withStandardDecorators(tool);
