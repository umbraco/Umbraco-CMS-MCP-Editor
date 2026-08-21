/**
 * Declaration-merge patch for a packaging gap in @umbraco-cms/mcp-dev@17.6.3.
 *
 * PR #413 (umbraco/Umbraco-CMS-MCP-Dev) added 7 new tools to the package's
 * runtime — create-and-publish-document, update-and-publish-document,
 * sort-document-children, sort-document-root-children, sort-media-children,
 * sort-media-root-children, get-user-batch — but its published tool-types.d.ts
 * was never regenerated to include them (verified against the same tool's
 * entry on @umbraco-cms/mcp-dev@18.1.2, which has it). Without this, chainCms
 * can't reference these tool names at all (CmsToolsName = keyof CmsTools).
 * Only the two we currently wrap (create-and-publish-document,
 * update-and-publish-document) are declared below — add the rest here if/when
 * they get wrapped too.
 *
 * CmsTools is declared as an `interface` upstream, so this merges cleanly.
 * Shapes below are read directly off the runtime Zod schemas in
 * node_modules/@umbraco-cms/mcp-dev/dist/chunk-*.js — remove this file once
 * a future @umbraco-cms/mcp-dev patch ships corrected declarations for these
 * tool names (check by re-running scripts/capture-cms-tool-surface.mjs's
 * isUmbracoAtLeast warning and grepping tool-types.d.ts for the names above).
 */

export {};

declare module "@umbraco-cms/mcp-dev/tool-types" {
  interface CreateAndPublishDocumentInput {
    documentTypeId: string;
    parentId?: string;
    name: string;
    templateId?: string;
    cultures?: string[];
    culturesToPublish?: string[];
    values?: Array<{
      editorAlias: string;
      culture: string | null;
      segment: string | null;
      alias: string;
      value?: unknown;
    }>;
  }

  interface CreateAndPublishDocumentOutput {
    message: string;
    id: string;
  }

  interface UpdateAndPublishDocumentInput {
    id: string;
    data: {
      values: Array<{
        culture?: string | null;
        segment?: string | null;
        alias: string;
        value?: unknown;
      }>;
      variants: Array<{
        culture?: string | null;
        segment?: string | null;
        name: string;
      }>;
      template?: { id: string } | null;
      culturesToPublish: string[];
    };
  }

  interface CmsTools {
    "create-and-publish-document": { input: CreateAndPublishDocumentInput; output: CreateAndPublishDocumentOutput };
    "update-and-publish-document": { input: UpdateAndPublishDocumentInput; output: unknown };
  }
}
