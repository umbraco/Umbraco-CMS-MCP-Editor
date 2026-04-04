import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level pages."),
  take: z.number().optional().default(50).describe("Number of results to return after filtering (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
      emptyFields: z.array(z.object({ alias: z.string() })),
      emptyFieldCount: z.number(),
    })
  ).describe("Pages with at least one empty field"),
  total: z.number().describe("Total number of pages with empty fields found"),
  scannedPages: z.number().describe("Number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-empty-fields",
  description: "Find pages with blank or missing property values. Scans pages in a subtree and reports which fields are empty. Use parentId to scope to a section. Scans up to 100 pages per call.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    const withEmptyFields = pages
      .map((page) => {
        const emptyFields = (page.values ?? [])
          .filter((v: any) => {
            if (v.value === null || v.value === undefined) return true;
            if (typeof v.value === "string" && v.value.trim() === "") return true;
            return false;
          })
          .map((v: any) => ({ alias: v.alias }));

        return { page, emptyFields };
      })
      .filter(({ emptyFields }) => emptyFields.length > 0);

    const total = withEmptyFields.length;
    const paginated = withEmptyFields.slice(skip, skip + take);

    return createToolResult({
      items: paginated.map(({ page, emptyFields }) => ({
        id: page.id,
        name: page.name,
        url: page.url,
        documentType: page.documentType,
        emptyFields,
        emptyFieldCount: emptyFields.length,
      })),
      total,
      scannedPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
