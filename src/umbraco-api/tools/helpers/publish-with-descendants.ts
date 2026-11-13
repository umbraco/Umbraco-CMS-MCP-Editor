import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";

interface PublishWithDescendantsData {
  includeUnpublishedDescendants: boolean;
  cultures: string[];
}

export type PublishWithDescendantsResult =
  | { ok: true; complete: true }
  | { ok: true; complete: false; taskId: string }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

// `publish-document-with-descendants` polls internally for up to 60s, then —
// instead of erroring — returns a successful `{ status: "in-progress", taskId }`
// payload for a tree too large to finish in that window. Give it this much
// longer to land before we give up and report it as still running: long
// enough to catch a tree that finishes just past the CMS's own cutoff,
// without a single tool call blocking for minutes.
const FOLLOWUP_MAX_ATTEMPTS = 30;
const FOLLOWUP_POLL_INTERVAL_MS = 2000;

/**
 * Parse `publish-document-with-descendants`'s success payload: `""` once the
 * publish completed inline or within its own poll window, or
 * `{ status: "in-progress", taskId, message }` if it gave up waiting first.
 */
export function parsePublishWithDescendantsStatus(
  data: unknown,
): { complete: true } | { complete: false; taskId: string } {
  if (
    data !== null &&
    typeof data === "object" &&
    (data as { status?: unknown }).status === "in-progress" &&
    typeof (data as { taskId?: unknown }).taskId === "string"
  ) {
    return { complete: false, taskId: (data as { taskId: string }).taskId };
  }
  return { complete: true };
}

/**
 * Publish a document and its descendants, following up on an in-progress
 * result with `get-document-publish-with-descendants-result` so a large tree
 * that finishes just after the CMS's own 60s window is still reported as
 * complete — rather than the caller treating "not an error" as "done".
 */
export async function publishWithDescendants(
  id: string,
  data: PublishWithDescendantsData,
): Promise<PublishWithDescendantsResult> {
  const initial = await chainCms("publish-document-with-descendants", { id, data });
  if (!initial.ok) return initial;

  const status = parsePublishWithDescendantsStatus(initial.data);
  if (status.complete) return { ok: true, complete: true };

  for (let attempt = 0; attempt < FOLLOWUP_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, FOLLOWUP_POLL_INTERVAL_MS));
    const poll = await chainCms("get-document-publish-with-descendants-result", {
      id,
      taskId: status.taskId,
    });
    if (!poll.ok) return poll;
    if (poll.data.isComplete) return { ok: true, complete: true };
  }

  return { ok: true, complete: false, taskId: status.taskId };
}
