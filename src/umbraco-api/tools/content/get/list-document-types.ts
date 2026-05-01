import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";


const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    alias: z.string(),
    name: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })).describe("Available document types"),
  total: z.number(),
});

interface DocTypeNode {
  id: string;
  name?: string;
  icon?: string;
  isFolder?: boolean;
  hasChildren?: boolean;
  flags?: { alias: string }[];
}

interface DocTypeDetails {
  id: string;
  alias: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
}

/**
 * Walk the doc-type tree, descending into folders, and return only actual document types.
 * The doc-type tree's root level is folder containers ("Compositions" / "Elements" /
 * "Pages") — listing root alone yields no usable types, so we recurse.
 */
async function collectDocumentTypeIds(): Promise<DocTypeNode[]> {
  const collected: DocTypeNode[] = [];
  const PAGE_SIZE = 100;

  async function walk(parentId: string | undefined): Promise<void> {
    let cursor: string | undefined = encodeCursor({ s: 0, t: PAGE_SIZE });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    while (true) {
      result = parentId
        ? await chainCms("get-document-type-children", { parentId, cursor })
        : await chainCms("get-document-type-root", { cursor });
      if (!result.ok) return;
      const items: DocTypeNode[] = (result.data.items as DocTypeNode[] | undefined) ?? [];
      for (const item of items) {
        if (item.isFolder) {
          if (item.hasChildren) await walk(item.id);
        } else {
          collected.push(item);
        }
      }
      const nextCursor: string | null | undefined = (result.data as { nextCursor?: string | null }).nextCursor;
      if (!nextCursor) break;
      cursor = nextCursor;
    }
  }

  await walk(undefined);
  return collected;
}

/**
 * Resolve the actual aliases by fetching each doc type by id. The tree-walk
 * response carries flags but in practice they don't contain the doc-type alias,
 * so we call get-document-type-by-id per item (in parallel) to get the
 * top-level alias field that's documented on the per-id endpoint.
 */
async function resolveDocTypeDetails(nodes: DocTypeNode[]): Promise<DocTypeDetails[]> {
  const results = await Promise.all(
    nodes.map(async (node): Promise<DocTypeDetails | null> => {
      const detailResult = await chainCms("get-document-type-by-id", { id: node.id });
      if (!detailResult.ok) return null;
      const d = detailResult.data;
      return {
        id: node.id,
        alias: d.alias ?? "",
        name: d.name ?? node.name,
        description: d.description ?? undefined,
        icon: d.icon ?? node.icon,
      };
    }),
  );
  return results.filter((r): r is DocTypeDetails => r !== null);
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-document-types",
  description: "List available document types that can be used to create new pages. Returns the ID, alias, and name of each type. Use this before create-page to find the correct documentTypeId. Returns up to 50 by default — use nextCursor from the response to fetch more.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    const nodes = await collectDocumentTypeIds();
    const sliced = nodes.slice(skip, skip + take);
    const details = await resolveDocTypeDetails(sliced);

    return createToolResult({
      items: details.map((d) => ({
        id: d.id,
        alias: d.alias,
        name: d.name ?? d.alias ?? "Unknown",
        description: d.description || undefined,
        icon: d.icon || undefined,
      })),
      total: nodes.length,
    });
  },
};

export default withStandardDecorators(tool);
