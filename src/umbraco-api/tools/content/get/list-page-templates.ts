import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the document whose template options to list"),
};

const templateRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  alias: z.string(),
});

const allowedTemplateSchema = templateRefSchema.extend({
  isDefault: z.boolean(),
  isCurrent: z.boolean(),
});

const outputSchema = z.object({
  id: z.string(),
  current: templateRefSchema.nullable(),
  default: templateRefSchema.nullable(),
  allowed: z.array(allowedTemplateSchema),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-page-templates",
  description: "List the templates a document can use. Returns the document's current template, the document type's default template, and every allowed template with isDefault/isCurrent flags. Use as a pre-flight before set-page-template, or to answer 'which layouts can this document use?'.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;

    const docTypeResult = await chainCms("get-document-type-by-id", { id: doc.documentType.id });
    if (!docTypeResult.ok) return docTypeResult.errorResult;
    const docType = docTypeResult.data;

    const currentId = doc.template?.id ?? null;
    const defaultId = docType.defaultTemplate?.id ?? null;
    const allowedIds = docType.allowedTemplates.map((t) => t.id);

    const idsToResolve = Array.from(new Set([
      ...allowedIds,
      ...(currentId ? [currentId] : []),
      ...(defaultId ? [defaultId] : []),
    ]));

    const tplResults = await Promise.all(
      idsToResolve.map((tid) => chainCms("get-template", { id: tid })),
    );
    const templatesById = new Map<string, { id: string; name: string; alias: string }>();
    for (let i = 0; i < idsToResolve.length; i++) {
      const r = tplResults[i];
      if (!r.ok) return r.errorResult;
      const tid = idsToResolve[i];
      templatesById.set(tid, { id: tid, name: r.data.name, alias: r.data.alias });
    }

    const toRef = (refId: string | null) => (refId && templatesById.get(refId)) || null;

    return createToolResult({
      id,
      current: toRef(currentId),
      default: toRef(defaultId),
      allowed: allowedIds.map((aid) => {
        const ref = templatesById.get(aid)!;
        return {
          ...ref,
          isDefault: aid === defaultId,
          isCurrent: aid === currentId,
        };
      }),
    });
  },
};

export default withStandardDecorators(tool);
