/**
 * Document validation helper.
 *
 * After a save (edit-page, edit-block, bulk-set-property, bulk-set-block-property)
 * the underlying CMS API persists the changes but does not surface property-level
 * validation. A page can be successfully saved yet remain unpublishable — required
 * fields missing, regex/length violations, etc. The agent then trusts the 200 OK
 * and moves on, only discovering the problem on a later publish (or never).
 *
 * This helper runs the same validation the backoffice does on save: it POSTs the
 * current doc payload to `/umbraco/management/api/v1/document/validate` (via the
 * `validate-document` chained CMS tool) and parses the resulting RFC 7807
 * ValidationProblemDetails back into a structured, LLM-readable shape.
 *
 * Returns `{ valid: true, errors: [] }` on success or when validation cannot be
 * reached — never throws. Callers attach the result to their tool output so the
 * agent can react in the same turn instead of trusting a successful save.
 */

import { z } from "zod";
import type { GetDocumentByIdOutput } from "@umbraco-cms/mcp-dev/tool-types";
import { chainCms } from "../../cms-chain.js";

export const validationErrorSchema = z.object({
  propertyAlias: z
    .string()
    .describe(
      "The alias of the property that failed validation, or '__document__' for document-level errors (mandatory cultures, name length, etc.)."
    ),
  culture: z.string().nullable().optional().describe("Culture for variant content. Null for invariant."),
  segment: z.string().nullable().optional().describe("Segment for segmented content. Null when none."),
  message: z.string().describe("Human-readable validation error message."),
});

export const validationResultSchema = z
  .object({
    valid: z.boolean().describe("True when the saved document passes server-side validation and is publishable."),
    errors: z
      .array(validationErrorSchema)
      .describe(
        "Property-level validation errors. Empty when `valid` is true. Each entry names the offending propertyAlias/culture/segment and a human message — surface these back to the editor so they know what to fix before publishing."
      ),
  })
  .describe(
    "Server-side validation outcome for the saved document. A 200 OK on save does NOT imply publishability — Umbraco only enforces required fields, regex, length, etc. via this validation endpoint. When `valid` is false the changes ARE persisted as a draft but the document cannot be published until the listed errors are resolved."
  );

export type ValidationResult = z.infer<typeof validationResultSchema>;

/**
 * Validate the saved state of a document.
 *
 * Refetches the document so the payload reflects the post-save state, then calls
 * the chained `validate-document` tool. Returns a structured result that is safe
 * to attach to tool output regardless of outcome (success, network failure,
 * unparseable response — all collapse to a stable shape).
 *
 * Pass `doc` to skip the refetch when the caller already has the post-save doc
 * in hand (e.g. just after a chained update that returns the updated document).
 */
export async function validateDocumentState(
  id: string,
  doc?: GetDocumentByIdOutput | null,
): Promise<ValidationResult> {
  let target = doc ?? null;
  if (!target) {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) {
      // We just saved successfully — if we can't refetch to validate, surface that
      // explicitly rather than claiming validity.
      return {
        valid: false,
        errors: [
          {
            propertyAlias: "__document__",
            message: "Could not refetch document to run validation.",
          },
        ],
      };
    }
    target = docResult.data;
  }

  const values = (target.values ?? []).map((v) => ({
    alias: v.alias,
    value: v.value,
    culture: v.culture ?? null,
    segment: v.segment ?? null,
  }));
  const variants = (target.variants ?? []).map((v) => ({
    name: v.name,
    culture: v.culture ?? null,
    segment: v.segment ?? null,
  }));

  const result = await chainCms("validate-document", {
    id,
    documentType: { id: target.documentType.id },
    template: target.template ? { id: target.template.id } : null,
    parent: null,
    values,
    variants,
  });

  if (result.ok) {
    return { valid: true, errors: [] };
  }

  return { valid: false, errors: parseValidationErrors(result.errorResult, values) };
}

/**
 * Parse the Umbraco ValidationProblemDetails error result back into
 * propertyAlias-keyed validation errors. The API encodes errors as JSON paths
 * like `$.values[3].value.someJsonPath` which we resolve back to the alias by
 * looking the index up in the request payload we just sent.
 */
function parseValidationErrors(
  errorResult: unknown,
  requestValues: Array<{ alias: string; culture: string | null; segment: string | null }>,
): ValidationResult["errors"] {
  const structured = extractStructured(errorResult);
  if (!structured) {
    return [
      {
        propertyAlias: "__document__",
        message: stringifyErrorFallback(errorResult),
      },
    ];
  }

  const errors = structured.errors;
  if (!errors || typeof errors !== "object") {
    return [
      {
        propertyAlias: "__document__",
        message: stringifyFromProblemDetails(structured),
      },
    ];
  }

  const out: ValidationResult["errors"] = [];
  for (const [jsonPath, messages] of Object.entries(errors)) {
    const messageList = Array.isArray(messages) ? messages : [String(messages)];
    const resolved = resolveJsonPath(jsonPath, requestValues);
    for (const message of messageList) {
      out.push({
        propertyAlias: resolved.propertyAlias,
        culture: resolved.culture,
        segment: resolved.segment,
        message: String(message),
      });
    }
  }

  if (out.length === 0) {
    out.push({
      propertyAlias: "__document__",
      message: stringifyFromProblemDetails(structured),
    });
  }

  return out;
}

interface ResolvedPath {
  propertyAlias: string;
  culture: string | null;
  segment: string | null;
}

const VALUES_PATH = /^\$\.values\[(\d+)\](?:\.value)?(.*)$/;

function resolveJsonPath(
  jsonPath: string,
  requestValues: Array<{ alias: string; culture: string | null; segment: string | null }>,
): ResolvedPath {
  const match = jsonPath.match(VALUES_PATH);
  if (match) {
    const index = Number(match[1]);
    const entry = requestValues[index];
    if (entry) {
      const trailing = match[2]?.replace(/^\./, "");
      return {
        propertyAlias: trailing ? `${entry.alias}${match[2]}` : entry.alias,
        culture: entry.culture,
        segment: entry.segment,
      };
    }
  }
  return { propertyAlias: jsonPath, culture: null, segment: null };
}

interface ProblemDetailsLike {
  title?: string;
  detail?: string;
  errors?: Record<string, unknown>;
  [key: string]: unknown;
}

function extractStructured(errorResult: unknown): ProblemDetailsLike | null {
  if (!errorResult || typeof errorResult !== "object") return null;
  const r = errorResult as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> };
  if (r.structuredContent && typeof r.structuredContent === "object") {
    return r.structuredContent as ProblemDetailsLike;
  }
  const text = r.content?.find((c) => c?.type === "text")?.text;
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        return parsed as ProblemDetailsLike;
      }
    } catch {
      // Fall through to fallback.
    }
  }
  return null;
}

function stringifyFromProblemDetails(pd: ProblemDetailsLike): string {
  if (pd.detail && typeof pd.detail === "string") return pd.detail;
  if (pd.title && typeof pd.title === "string") return pd.title;
  return "Document failed validation but no detail was returned.";
}

function stringifyErrorFallback(errorResult: unknown): string {
  if (!errorResult || typeof errorResult !== "object") return "Document failed validation.";
  const r = errorResult as { content?: Array<{ type?: string; text?: string }> };
  const text = r.content?.find((c) => c?.type === "text")?.text;
  return text ? text : "Document failed validation.";
}
