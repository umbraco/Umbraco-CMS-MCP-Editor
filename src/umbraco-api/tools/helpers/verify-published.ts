import { chainCms } from "../../cms-chain.js";

const PUBLISHED_STATES = new Set(["Published", "PublishedPendingChanges"]);

/**
 * Re-read a document's published state after a publish call to confirm the
 * publish actually took effect.
 *
 * Why: `chainCms("publish-document", ...)` can return a successful response
 * even when the document remains in Draft — e.g. when a workflow handler or
 * event subscriber reverts the publish post-hoc. Without this check, the tool
 * would report success while the document is still unpublished.
 *
 * Returns `null` on success, or a human-readable detail string describing
 * which cultures failed to land in a published state.
 */
export async function verifyDocumentPublished(
  id: string,
  expectedCultures: Array<string | null>,
): Promise<string | null> {
  const status = await chainCms("get-document-publish", { id });
  if (!status.ok) {
    return "publish call returned success but the document has no published state — it may have been blocked by an approval workflow or event handler";
  }
  const variants = status.data.variants ?? [];
  const failures: string[] = [];
  for (const culture of expectedCultures) {
    const variant = variants.find((v) => (v.culture ?? null) === culture);
    if (!variant || !PUBLISHED_STATES.has(variant.state)) {
      failures.push(culture ?? "invariant");
    }
  }
  if (failures.length === 0) return null;
  return `publish call returned success but ${failures.length === 1 ? "this culture is" : "these cultures are"} still in draft: ${failures.join(", ")}`;
}
