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

let overrideForceOn: boolean | undefined;

/**
 * Set once from src/index.ts after loadServerConfig(), reflecting whether
 * --umbraco-human-in-the-loop was passed on the CLI. The SDK's generic boolean
 * config field collapses any falsy CLI/env value to `undefined`, so this can
 * only ever signal "force the gate closed" — there is no way to force it open
 * from the CLI. Opening the gate is a UMBRACO_HUMAN_IN_THE_LOOP=false decision
 * made in the environment, not on the command line.
 */
export function setHumanInTheLoopOverride(forceOn: boolean | undefined): void {
  overrideForceOn = forceOn;
}

/** True when publish/unpublish/delete on content must be refused. */
export function isHumanInTheLoopBlocking(): boolean {
  if (overrideForceOn) return true;
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
