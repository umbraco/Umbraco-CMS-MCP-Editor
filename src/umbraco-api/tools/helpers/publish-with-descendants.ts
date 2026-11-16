import { chainCms, extractInnerProblemDetails, type ChainError } from "../../cms-chain.js";

interface PublishWithDescendantsData {
  includeUnpublishedDescendants: boolean;
  cultures: string[];
}

interface PublishWithDescendantsOptions {
  /**
   * Follow up an in-progress result with `get-document-publish-with-descendants-result`
   * until it completes or the follow-up budget runs out. Default true.
   *
   * A caller publishing several documents in sequence (bulk-publish) should
   * pass `false` — the CMS tool's own ~60s internal wait is already paid once
   * per item, and stacking another ~60s follow-up on top of that, per item,
   * turns a 10-item bulk request into a worst case of several minutes blocked
   * on one tool call.
   */
  followUp?: boolean;
}

export type PublishWithDescendantsResult =
  | { ok: true; complete: true }
  // Still running — either the CMS tool said so, or we can no longer tell
  // because our own chained request to it timed out first. Either way: don't
  // retry (the CMS tool is `idempotentHint: false` — a retry starts a second
  // concurrent recursive publish job), just re-check the page later.
  | { ok: true; complete: false }
  | ChainError;

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
 *
 * The chained tool's output type is `unknown` (no outputSchema upstream), so
 * this is duck-typed rather than schema-validated — warn if a payload is
 * neither shape, so a future upstream change that renames/restructures the
 * in-progress marker shows up in logs instead of silently reading as "done".
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
  if (data !== "") {
    console.warn(
      `publish-document-with-descendants returned an unrecognized success payload (neither "" nor an in-progress marker) — treating as complete: ${JSON.stringify(data)}`,
    );
  }
  return { complete: true };
}

/**
 * The MCP client's own request timeout (60s by default — see
 * `@modelcontextprotocol/sdk`'s `DEFAULT_REQUEST_TIMEOUT_MSEC`) is about the
 * same length as `publish-document-with-descendants`'s internal poll window,
 * so in stdio-chained mode our own request can time out moments before the
 * CMS tool would have returned its "still running" payload. Recognize that
 * specific failure and treat it the same as an explicit in-progress result —
 * the job is very likely still running server-side, so reporting it as a
 * hard failure would invite a retry, which is unsafe (see `idempotentHint`
 * on the call sites). There's no taskId to follow up with in this case: the
 * request never got a response at all.
 */
function isRequestTimeout(error: ChainError): boolean {
  const detail = extractInnerProblemDetails(error.errorResult as Record<string, unknown>).detail;
  return typeof detail === "string" && detail.includes("Request timed out");
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
  options?: PublishWithDescendantsOptions,
): Promise<PublishWithDescendantsResult> {
  const initial = await chainCms("publish-document-with-descendants", { id, data });
  if (!initial.ok) {
    if (isRequestTimeout(initial)) return { ok: true, complete: false };
    return initial;
  }

  const status = parsePublishWithDescendantsStatus(initial.data);
  if (status.complete) return { ok: true, complete: true };
  if (options?.followUp === false) return { ok: true, complete: false };

  for (let attempt = 0; attempt < FOLLOWUP_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, FOLLOWUP_POLL_INTERVAL_MS));
    const poll = await chainCms("get-document-publish-with-descendants-result", {
      id,
      taskId: status.taskId,
    });
    if (!poll.ok) {
      if (isRequestTimeout(poll)) return { ok: true, complete: false };
      return poll;
    }
    if (poll.data.isComplete) return { ok: true, complete: true };
  }

  return { ok: true, complete: false };
}
