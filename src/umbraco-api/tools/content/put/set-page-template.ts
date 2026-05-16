import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildPublishStatus, publishStatusSchema } from "../../helpers/publish-status.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the document whose template to change"),
  templateId: z.string().uuid().nullable().describe("The new template ID, or null to clear the template back to the document type's default. Must be one of the document type's allowed templates — call list-page-templates first to discover them."),
};

const templateRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  alias: z.string(),
});

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  oldTemplate: templateRefSchema.nullable(),
  newTemplate: templateRefSchema.nullable(),
  publishStatus: publishStatusSchema,
  previewUrl: previewUrlSchema,
});

async function resolveTemplateRef(id: string | null) {
  if (!id) return null;
  const result = await chainCms("get-template", { id });
  if (!result.ok) return null;
  return { id, name: result.data.name, alias: result.data.alias };
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "set-page-template",
  description: "Switch the template (rendering layout) of a document. Pass a templateId from the document type's allowed templates, or null to clear back to the default. Changes are saved but NOT published — the live page keeps the old template until you publish. You will be asked to confirm before changing.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, templateId }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";

    const docTypeResult = await chainCms("get-document-type-by-id", { id: doc.documentType.id });
    if (!docTypeResult.ok) return docTypeResult.errorResult;
    const allowedIds = docTypeResult.data.allowedTemplates.map((t) => t.id);

    if (templateId !== null && !allowedIds.includes(templateId)) {
      return createToolResultError({
        status: 400,
        title: "Template not allowed for this document type",
        detail: `templateId ${templateId} is not in allowedTemplates. Call list-page-templates to see the allowed templates for this document.`,
      });
    }

    const [oldTemplate, newTemplate] = await Promise.all([
      resolveTemplateRef(doc.template?.id ?? null),
      resolveTemplateRef(templateId),
    ]);

    const oldLabel = oldTemplate ? `"${oldTemplate.name}"` : "(none)";
    const newLabel = newTemplate ? `"${newTemplate.name}"` : "(none — clear to default)";
    if (!await requestApproval(extra, `Switch template on "${pageName}" from ${oldLabel} to ${newLabel}?`)) {
      return createToolResult({
        message: "Template change cancelled",
        id,
        name: pageName,
        oldTemplate,
        newTemplate: oldTemplate,
        publishStatus: buildPublishStatus(doc),
        previewUrl: null,
      });
    }

    const updateResult = await chainCms("update-document", {
      id,
      data: {
        values: (doc.values ?? []).map((v) => ({
          alias: v.alias,
          value: v.value,
          culture: v.culture ?? null,
          segment: v.segment ?? null,
        })),
        variants: (doc.variants ?? []).map((v) => ({
          name: v.name ?? "",
          culture: v.culture ?? null,
          segment: v.segment ?? null,
        })),
        template: templateId ? { id: templateId } : null,
      },
    });
    if (!updateResult.ok) return updateResult.errorResult;

    const freshResult = await chainCms("get-document-by-id", { id });
    if (!freshResult.ok) return freshResult.errorResult;

    return createToolResult({
      message: newTemplate
        ? `Switched "${pageName}" to template "${newTemplate.name}" (saved, not published)`
        : `Cleared template on "${pageName}" — will use document type default (saved, not published)`,
      id,
      name: pageName,
      oldTemplate,
      newTemplate,
      publishStatus: buildPublishStatus(freshResult.data),
      previewUrl: await fetchPreviewUrl(id),
    });
  },
};

export default withStandardDecorators(tool);
