import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { getUmbracoBaseUrl } from "./preview-url.js";

/**
 * publish/unpublish can point at a specific document when one exists; delete
 * never does (only a generic Content-section link), which this union enforces
 * at the call site rather than by convention.
 */
export type HumanInTheLoopAction =
  | { verb: "publish" | "unpublish"; documentId?: string; hint?: string }
  | { verb: "delete"; hint?: string };

let override: boolean | undefined;

/**
 * Set once at startup by whichever entry point resolved config for this
 * runtime: `src/index.ts` (stdio) from the CLI-flag/env-resolved custom
 * config field, or `src/worker.ts` (hosted) from the Worker's `env` binding.
 * `undefined` means "no override" — `isHumanInTheLoopBlocking()` falls
 * through to a direct `process.env` read.
 *
 * The hosted path in particular cannot rely on that fallback: a Durable
 * Object's tool-handler execution context doesn't reliably reflect vars
 * passed to `env` the same way plain module-scope code does, so
 * `src/worker.ts` reads `this.env.UMBRACO_HUMAN_IN_THE_LOOP` directly (the
 * one channel confirmed to work inside the Durable Object) and pushes the
 * resolved value here explicitly, the same way `UMBRACO_READONLY` is read
 * from `env` rather than `process.env` in hosted mode.
 *
 * On the stdio side, the SDK's generic boolean config field collapses any
 * falsy CLI/env value to `undefined`, so that path can only ever push `true`
 * (force closed) or `undefined` (no override) — never `false`.
 */
export function setHumanInTheLoopOverride(value: boolean | undefined): void {
  override = value;
}

/** True when publish/unpublish/delete on content must be refused. */
export function isHumanInTheLoopBlocking(): boolean {
  if (override !== undefined) return override;
  const raw = process.env.UMBRACO_HUMAN_IN_THE_LOOP;
  return raw?.trim().toLowerCase() !== "false";
}

function buildDocumentEditUrl(id: string): string | null {
  const baseUrl = getUmbracoBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/umbraco/section/content/workspace/document/edit/${encodeURIComponent(id)}`;
}

function buildContentSectionUrl(): string | null {
  const baseUrl = getUmbracoBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/umbraco/section/content`;
}

/**
 * The single call site every gated tool uses, as the first line of its
 * handler. Returns null when the gate is open (proceed as normal); otherwise
 * returns a ready-to-return error result — the caller does
 * `const gate = checkHumanInTheLoop(...); if (gate) return gate;` before any
 * chained CMS call, so a blocked call has zero side effects.
 */
export function checkHumanInTheLoop(
  action: HumanInTheLoopAction
): ReturnType<typeof createToolResultError> | null {
  if (!isHumanInTheLoopBlocking()) return null;

  const verbLabel = action.verb === "publish" ? "Publish" : action.verb === "unpublish" ? "Unpublish" : "Delete";
  const url =
    action.verb !== "delete" && action.documentId
      ? buildDocumentEditUrl(action.documentId)
      : buildContentSectionUrl();

  const linkSentence = url ? ` Open ${url} and do it there.` : "";
  const hintSentence = action.hint ? ` ${action.hint}` : "";

  return createToolResultError({
    status: 403,
    title: `${verbLabel} blocked — human action required`,
    detail: `This Umbraco instance requires a person to ${action.verb} content directly in the backoffice; it is not performed by this tool.${linkSentence}${hintSentence}`,
  });
}
