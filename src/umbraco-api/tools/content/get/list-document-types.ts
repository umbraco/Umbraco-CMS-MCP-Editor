import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { hasSettingsAccess } from "../../helpers/settings-access.js";

type ErrorResult = ReturnType<typeof createToolResultError>;


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

type TreeWalkResult =
  | { ok: true; nodes: DocTypeNode[] }
  | { ok: false; errorResult: ErrorResult };

/**
 * Walk the doc-type tree, descending into folders, and return only actual document types.
 * The doc-type tree's root level is folder containers ("Compositions" / "Elements" /
 * "Pages") — listing root alone yields no usable types, so we recurse.
 *
 * A chained failure partway through (e.g. `Forbidden`) must not be swallowed —
 * it's surfaced as an error rather than silently truncating the list.
 */
async function collectDocumentTypeIds(): Promise<TreeWalkResult> {
  const collected: DocTypeNode[] = [];
  const PAGE_SIZE = 100;

  async function walk(parentId: string | undefined): Promise<TreeWalkResult | undefined> {
    let cursor: string | undefined = encodeCursor({ s: 0, t: PAGE_SIZE });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    while (true) {
      result = parentId
        ? await chainCms("get-document-type-children", { parentId, cursor })
        : await chainCms("get-document-type-root", { cursor });
      if (!result.ok) return { ok: false, errorResult: result.errorResult };
      const items: DocTypeNode[] = (result.data.items as DocTypeNode[] | undefined) ?? [];
      for (const item of items) {
        if (item.isFolder) {
          if (item.hasChildren) {
            const childResult = await walk(item.id);
            if (childResult && !childResult.ok) return childResult;
          }
        } else {
          collected.push(item);
        }
      }
      const nextCursor: string | null | undefined = (result.data as { nextCursor?: string | null }).nextCursor;
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    return undefined;
  }

  const failure = await walk(undefined);
  if (failure && !failure.ok) return failure;
  return { ok: true, nodes: collected };
}

type ResolveDetailsResult =
  | { ok: true; details: DocTypeDetails[] }
  | { ok: false; errorResult: ErrorResult };

/**
 * Resolve the actual aliases by fetching each doc type by id. The tree-walk
 * response carries flags but in practice they don't contain the doc-type alias,
 * so we call get-document-type-by-id per item (in parallel) to get the
 * top-level alias field that's documented on the per-id endpoint.
 *
 * A chained failure for any one item must not silently drop it from the
 * results — it's surfaced as an error for the whole call.
 */
async function resolveDocTypeDetails(nodes: DocTypeNode[]): Promise<ResolveDetailsResult> {
  const results = await Promise.all(
    nodes.map(async (node): Promise<ResolveDetailsResult & { node: DocTypeNode }> => {
      const detailResult = await chainCms("get-document-type-by-id", { id: node.id });
      if (!detailResult.ok) return { ok: false, errorResult: detailResult.errorResult, node };
      const d = detailResult.data;
      return {
        ok: true,
        details: [{
          id: node.id,
          alias: d.alias ?? "",
          name: d.name ?? node.name,
          description: d.description ?? undefined,
          icon: d.icon ?? node.icon,
        }],
        node,
      };
    }),
  );
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) return { ok: false, errorResult: failed.errorResult };
  const details = results.flatMap((r) => (r.ok ? r.details : []));
  return { ok: true, details };
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-document-types",
  description: "List available document types that can be used to create new pages. Returns the ID, alias, and name of each type. Use this before create-page to find the correct documentTypeId. Returns up to 50 by default — use nextCursor from the response to fetch more.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    // Settings gate — see settings-access.ts. The document-type tree only
    // works against Settings-section endpoints; an editor without Settings
    // access gets a raw Forbidden (or, in the tree walk, a silently
    // empty/truncated list). Refuse up front with a clear 403 instead.
    if (!(await hasSettingsAccess())) {
      return createToolResultError({
        status: 403,
        title: "Settings access required",
        detail: "Listing document types requires the API user's Umbraco user to have access to the Settings section. Grant Settings-section access to the API user's user group in the Umbraco backoffice (Settings → Users → [group] → Sections), then retry.",
      });
    }

    const treeResult = await collectDocumentTypeIds();
    if (!treeResult.ok) return treeResult.errorResult;
    const { nodes } = treeResult;

    const sliced = nodes.slice(skip, skip + take);
    const detailsResult = await resolveDocTypeDetails(sliced);
    if (!detailsResult.ok) return detailsResult.errorResult;
    const { details } = detailsResult;

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
