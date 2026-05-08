/**
 * Helper to locate an invariant document type ID for translation regression tests.
 *
 * The Clean starter kit ships a "Content" document type (GUID below) with
 * variesByCulture=false. We check that first; if it is not present (different
 * seed), we fall back to scanning the document-type root for any invariant type.
 *
 * Since the "Content" doctype is not allowed as root, we also resolve a
 * suitable parent page (the first root content page, which is the Home page
 * in the Clean starter kit and accepts "Content" as a child type).
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

/** Known invariant "Content" doctype GUID in the Umbraco Clean starter kit. */
const CLEAN_STARTER_KIT_CONTENT_TYPE_ID = "b871f83c-2395-4894-be0f-5422c1a71e48";

export interface InvariantDoctypeInfo {
  /** The invariant doctype ID. */
  id: string;
  /** A parent page ID to create test content under, or undefined if allowedAsRoot. */
  parentId?: string;
}

async function getDocType(id: string): Promise<{ variesByCulture: boolean; allowedAsRoot: boolean } | null> {
  try {
    const result = await mcpClientManager.callTool("cms", "get-document-type-by-id", { id });
    if (result.isError) return null;
    const dt = extractChainedResult(result);
    return { variesByCulture: dt?.variesByCulture ?? true, allowedAsRoot: dt?.allowedAsRoot ?? false };
  } catch {
    return null;
  }
}

async function getFirstRootPageId(): Promise<string | undefined> {
  try {
    const result = await mcpClientManager.callTool("cms", "get-document-root", {
      cursor: btoa(JSON.stringify({ s: 0, t: 1 })),
    });
    if (result.isError) return undefined;
    const data = extractChainedResult(result);
    return data?.items?.[0]?.id as string | undefined;
  } catch {
    return undefined;
  }
}

let cachedInfo: InvariantDoctypeInfo | null | undefined;

/**
 * Returns the ID of an invariant document type and an optional parent page ID
 * for content creation, or undefined if none can be found.
 */
export async function findInvariantDocumentTypeId(): Promise<string | undefined> {
  return (await findInvariantDoctypeInfo())?.id;
}

export async function findInvariantDoctypeInfo(): Promise<InvariantDoctypeInfo | undefined> {
  if (cachedInfo !== undefined) {
    return cachedInfo ?? undefined;
  }

  // Try the well-known GUID first
  const known = await getDocType(CLEAN_STARTER_KIT_CONTENT_TYPE_ID);
  if (known && known.variesByCulture === false) {
    const info: InvariantDoctypeInfo = { id: CLEAN_STARTER_KIT_CONTENT_TYPE_ID };
    if (!known.allowedAsRoot) {
      info.parentId = await getFirstRootPageId();
    }
    cachedInfo = info;
    return info;
  }

  // Dynamic fallback: scan the document-type root for any invariant type
  try {
    const rootResult = await mcpClientManager.callTool("cms", "get-document-type-root", {
      cursor: btoa(JSON.stringify({ s: 0, t: 50 })),
    });
    if (!rootResult.isError) {
      const rootData = extractChainedResult(rootResult);
      const items: Array<{ id: string; isFolder?: boolean }> = rootData?.items ?? [];
      for (const item of items) {
        if (item.isFolder) continue;
        const dt = await getDocType(item.id);
        if (dt && dt.variesByCulture === false) {
          const info: InvariantDoctypeInfo = { id: item.id };
          if (!dt.allowedAsRoot) {
            info.parentId = await getFirstRootPageId();
          }
          cachedInfo = info;
          return info;
        }
      }
    }
  } catch {
    // Best-effort
  }

  cachedInfo = null;
  return undefined;
}
