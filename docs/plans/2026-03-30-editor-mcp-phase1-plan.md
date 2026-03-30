# Editor MCP Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the foundation (chaining, elicitation, safety layer) and content core (CRUD, publishing, versioning) for the editor MCP.

**Architecture:** Editor MCP chains to `@umbraco-cms/mcp-dev` via `mcpClientManager` delegation (not proxying). Tools are organised into domain collections (content, publishing, versioning). Write operations use MCP elicitation for confirmation. Dev MCP tools are never exposed to editors.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` 1.25+, `@umbraco-cms/mcp-server-sdk`, Zod, Jest, MSW

**Reference docs:** https://docs.umbraco.com/umbraco-base-mcp/sdk

---

## Task 1: Clean Up Template Scaffolding

Remove the example/chained tools and update registries so we start clean.

**Files:**
- Delete: `src/umbraco-api/tools/chained/get-chained-info.ts`
- Delete: `src/umbraco-api/tools/chained/index.ts`
- Modify: `src/index.ts` — remove chained collection import, keep chaining infrastructure
- Modify: `src/collections.ts` — remove chained collection export
- Modify: `src/config/mode-registry.ts` — replace example mode with Phase 1 modes

**Step 1: Delete the chained example collection**

Remove `src/umbraco-api/tools/chained/` entirely.

**Step 2: Update `src/index.ts`**

Remove the import of `chainedCollection` and its entry in the `collections` array. Keep the `mcpClientManager` import and chaining infrastructure — we still need that.

```typescript
// Remove this line:
import chainedCollection from "./umbraco-api/tools/chained/index.js";

// Update collections to empty (we'll add real ones in later tasks):
const collections = [];
```

**Step 3: Update `src/collections.ts`**

Remove the chained collection re-export. Will be updated with real collections later.

**Step 4: Update `src/config/mode-registry.ts`**

Replace the `umbraco-server` mode with Phase 1 modes:

```typescript
export const toolModes: ToolModeDefinition[] = [
  {
    name: 'content',
    displayName: 'Content Management',
    description: 'Create, edit, search, and manage content pages',
    collections: ['content', 'publishing', 'versioning']
  },
];
```

**Step 5: Run compile check**

Run: `npm run compile`
Expected: No errors

**Step 6: Commit**

```
chore: remove template example tools and set up Phase 1 modes
```

---

## Task 2: Configure Chaining (Dev MCP as Delegation-Only)

Ensure the dev MCP is configured for delegation only — no proxying. Editor tools call dev MCP tools via `mcpClientManager.callTool()` internally.

**Files:**
- Modify: `src/config/mcp-servers.ts` — set `proxyTools: false`
- Modify: `src/index.ts` — remove proxied tool discovery/registration block

**Step 1: Update `src/config/mcp-servers.ts`**

Change `proxyTools` to `false` on the real CMS server config:

```typescript
const realCmsServer: McpServerConfig = {
  name: "cms",
  command: "npx",
  args: ["-y", "@umbraco-cms/mcp-dev@17"],
  env: {
    UMBRACO_BASE_URL: process.env.UMBRACO_BASE_URL || "http://localhost:44391",
    UMBRACO_CLIENT_ID: process.env.UMBRACO_CLIENT_ID || "",
    UMBRACO_CLIENT_SECRET: process.env.UMBRACO_CLIENT_SECRET || "",
  },
  proxyTools: false,  // Delegation only — tools not exposed to editors
};
```

Also set `proxyTools: false` on the mock server.

**Step 2: Remove proxied tool registration from `src/index.ts`**

Remove the entire `discoverProxiedTools` block inside `main()`. The chained server still connects (so `mcpClientManager.callTool()` works), but no tools are proxied through.

Keep the `mcpClientManager` connection and the SIGINT/SIGTERM cleanup handlers.

**Step 3: Run compile check**

Run: `npm run compile`
Expected: No errors

**Step 4: Commit**

```
feat: configure dev MCP as delegation-only (no proxied tools)
```

---

## Task 3: Create Content Collection — Search & Browse (Utility Tools)

Build the first real tools: read-only utility tools for searching and browsing content. These establish the delegation pattern without needing elicitation.

**Files:**
- Create: `src/umbraco-api/tools/content/index.ts`
- Create: `src/umbraco-api/tools/content/get/search-content.ts`
- Create: `src/umbraco-api/tools/content/get/get-page.ts`
- Create: `src/umbraco-api/tools/content/get/browse-children.ts`
- Modify: `src/index.ts` — register content collection
- Modify: `src/collections.ts` — export content collection

**Step 1: Create collection index**

```typescript
// src/umbraco-api/tools/content/index.ts
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchContentTool from "./get/search-content.js";
import getPageTool from "./get/get-page.js";
import browseChildrenTool from "./get/browse-children.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content",
    displayName: "Content",
    description: "Search, browse, and manage content pages",
  },
  tools: () => [searchContentTool, getPageTool, browseChildrenTool],
};

export default collection;
```

**Step 2: Create `search-content` tool**

Editor-friendly tool that delegates to `cms:search-document`.

```typescript
// src/umbraco-api/tools/content/get/search-content.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  query: z.string().describe("Search term to find content pages"),
  take: z.number().optional().default(10).describe("Number of results to return (default 10)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })).describe("Matching content pages"),
  total: z.number().describe("Total number of matches"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "search-content",
  description: "Search for content pages by name or text. Returns a list of matching pages with their names and IDs.",
  inputSchema,
  outputSchema,
  slices: ["search"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async ({ query, take, skip }) => {
    const result = await mcpClientManager.callTool("cms", "search-document", {
      query,
      take,
      skip,
    });

    if (result.isError) {
      return createToolResultError(result);
    }

    const data = result.structuredContent as any;
    return createToolResult({
      items: data.items ?? [],
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 3: Create `get-page` tool**

```typescript
// src/umbraco-api/tools/content/get/get-page.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The unique ID of the page to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentType: z.string(),
  values: z.array(z.any()).describe("Content field values"),
  variants: z.array(z.any()).describe("Language/culture variants"),
  urls: z.array(z.any()).optional().describe("Published URLs"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-page",
  description: "Get the full details of a content page including all its fields and values. Use this after search-content to see what a page contains.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });

    if (result.isError) {
      return createToolResultError(result);
    }

    const doc = result.structuredContent as any;
    return createToolResult({
      id: doc.id,
      name: doc.variants?.[0]?.name ?? doc.name ?? "Unknown",
      documentType: doc.documentType?.alias ?? "unknown",
      values: doc.values ?? [],
      variants: doc.variants ?? [],
      urls: doc.urls ?? [],
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 4: Create `browse-children` tool**

```typescript
// src/umbraco-api/tools/content/get/browse-children.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Parent page ID. Omit to get root-level pages."),
  take: z.number().optional().default(20).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    hasChildren: z.boolean(),
  })).describe("Child pages"),
  total: z.number().describe("Total number of children"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "browse-children",
  description: "Browse content pages in the site tree. Shows child pages under a parent, or root-level pages if no parent is specified. Use this to navigate the site structure.",
  inputSchema,
  outputSchema,
  slices: ["tree"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async ({ parentId, take, skip }) => {
    const toolName = parentId ? "get-document-children" : "get-document-root";
    const args: Record<string, unknown> = { take, skip };
    if (parentId) args.parentId = parentId;

    const result = await mcpClientManager.callTool("cms", toolName, args);

    if (result.isError) {
      return createToolResultError(result);
    }

    const data = result.structuredContent as any;
    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
        hasChildren: item.hasChildren ?? false,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 5: Register the collection in `src/index.ts`**

```typescript
import contentCollection from "./umbraco-api/tools/content/index.js";

const collections = [contentCollection];
```

**Step 6: Update `src/collections.ts`**

Export the content collection for the hosted worker entry point.

**Step 7: Run compile check**

Run: `npm run compile`
Expected: No errors

**Step 8: Commit**

```
feat: add content collection with search, get-page, and browse tools
```

---

## Task 4: Create Publishing Collection — Utility & Workflow Tools

Build the publishing collection with a read-only status tool and write workflow tools that use elicitation for confirmation.

**Files:**
- Create: `src/umbraco-api/tools/publishing/index.ts`
- Create: `src/umbraco-api/tools/publishing/get/get-publish-status.ts`
- Create: `src/umbraco-api/tools/publishing/post/publish-page.ts`
- Create: `src/umbraco-api/tools/publishing/post/unpublish-page.ts`
- Modify: `src/index.ts` — register publishing collection
- Modify: `src/collections.ts` — export publishing collection

**Step 1: Create collection index**

```typescript
// src/umbraco-api/tools/publishing/index.ts
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import publishPageTool from "./post/publish-page.js";
import unpublishPageTool from "./post/unpublish-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "publishing",
    displayName: "Publishing",
    description: "Publish and unpublish content pages",
    dependencies: ["content"],
  },
  tools: () => [publishPageTool, unpublishPageTool],
};

export default collection;
```

**Step 2: Create `publish-page` workflow tool**

This is the first workflow tool — it fetches the page name, then uses elicitation to confirm before publishing.

```typescript
// src/umbraco-api/tools/publishing/post/publish-page.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to publish"),
  includeDescendants: z.boolean().optional().default(false)
    .describe("Whether to also publish all child pages"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "publish-page",
  description:
    "Publish a content page to make it live on the website. " +
    "Optionally publish all child pages too. " +
    "You will be asked to confirm before publishing.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  handler: async ({ id, includeDescendants }, extra) => {
    // Step 1: Fetch page details for confirmation message
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);

    const doc = docResult.structuredContent as any;
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation from the editor
    const confirmMessage = includeDescendants
      ? `Publish "${pageName}" and all its child pages to the live site?`
      : `Publish "${pageName}" to the live site?`;

    const elicitResult = await extra.elicit({
      message: confirmMessage,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm publish",
            description: confirmMessage,
            default: true,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !elicitResult.content?.confirm) {
      return createToolResult({ message: "Publish cancelled", id, name: pageName });
    }

    // Step 3: Execute publish via dev MCP
    const publishArgs: Record<string, unknown> = { id, data: { publishSchedules: [] } };
    const toolName = includeDescendants
      ? "publish-document-with-descendants"
      : "publish-document";
    const publishResult = await mcpClientManager.callTool("cms", toolName, publishArgs);

    if (publishResult.isError) return createToolResultError(publishResult);

    return createToolResult({
      message: includeDescendants
        ? `Published "${pageName}" and all child pages`
        : `Published "${pageName}"`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 3: Create `unpublish-page` workflow tool**

Same pattern — fetch details, elicit confirmation, execute.

```typescript
// src/umbraco-api/tools/publishing/post/unpublish-page.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to unpublish"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "unpublish-page",
  description:
    "Unpublish a content page, removing it from the live website. " +
    "The page will still exist as a draft. " +
    "You will be asked to confirm before unpublishing.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  handler: async ({ id }, extra) => {
    // Step 1: Fetch page details
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);

    const doc = docResult.structuredContent as any;
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation
    const elicitResult = await extra.elicit({
      message: `Unpublish "${pageName}"? This will remove it from the live website. The page will still exist as a draft.`,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm unpublish",
            description: `Remove "${pageName}" from the live site`,
            default: false,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !elicitResult.content?.confirm) {
      return createToolResult({ message: "Unpublish cancelled", id, name: pageName });
    }

    // Step 3: Execute unpublish
    const result = await mcpClientManager.callTool("cms", "unpublish-document", {
      id,
      data: { cultures: [] },
    });

    if (result.isError) return createToolResultError(result);

    return createToolResult({
      message: `Unpublished "${pageName}" — it is now a draft only`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 4: Register in `src/index.ts` and `src/collections.ts`**

Add `publishingCollection` to the collections array in both files.

**Step 5: Run compile check**

Run: `npm run compile`
Expected: No errors

**Step 6: Commit**

```
feat: add publishing collection with elicitation-confirmed publish/unpublish
```

---

## Task 5: Create Content Workflow Tools (Create & Edit Page)

The most complex tools — multi-step workflows that guide editors through content creation using elicitation.

**Files:**
- Create: `src/umbraco-api/tools/content/post/create-page.ts`
- Create: `src/umbraco-api/tools/content/put/edit-page.ts`
- Create: `src/umbraco-api/tools/content/delete/delete-page.ts`
- Modify: `src/umbraco-api/tools/content/index.ts` — add new tools

**Step 1: Create `create-page` workflow tool**

Multi-step: name + type → parent location → create as draft. The LLM provides values; elicitation confirms before creating.

```typescript
// src/umbraco-api/tools/content/post/create-page.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  name: z.string().describe("Name for the new page"),
  documentTypeId: z.string().uuid().describe("The document type ID to use for this page"),
  parentId: z.string().uuid().optional().describe("Parent page ID. Omit to create at root level."),
  values: z.array(z.object({
    alias: z.string().describe("Property alias"),
    value: z.any().describe("Property value"),
    culture: z.string().nullable().optional().describe("Culture code for variant content"),
    segment: z.string().nullable().optional().describe("Segment identifier"),
  })).optional().default([]).describe("Content field values to set"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-page",
  description:
    "Create a new content page as a draft. The page is NOT published automatically — " +
    "use publish-page afterwards to make it live. " +
    "You will be asked to confirm the page details before creating it.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  handler: async ({ name, documentTypeId, parentId, values }, extra) => {
    // Step 1: Elicit confirmation
    const location = parentId ? `under page ${parentId}` : "at the root level";
    const fieldCount = values.length;

    const elicitResult = await extra.elicit({
      message: `Create page "${name}" ${location} with ${fieldCount} field(s) set? The page will be saved as a draft (not published).`,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm create",
            description: `Create "${name}" as a draft page`,
            default: true,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !elicitResult.content?.confirm) {
      return createToolResult({ message: "Page creation cancelled", id: "", name });
    }

    // Step 2: Create via dev MCP
    const createResult = await mcpClientManager.callTool("cms", "create-document", {
      name,
      documentTypeId,
      parentId,
      values: values.map(v => ({
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
        editorAlias: v.alias,
      })),
    });

    if (createResult.isError) return createToolResultError(createResult);

    const created = createResult.structuredContent as any;
    return createToolResult({
      message: `Created draft page "${name}". Use publish-page to make it live.`,
      id: created.id,
      name,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 2: Create `edit-page` workflow tool**

Updates specific fields on an existing page with elicitation confirmation.

```typescript
// src/umbraco-api/tools/content/put/edit-page.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("ID of the page to edit"),
  values: z.array(z.object({
    alias: z.string().describe("Property alias to update"),
    value: z.any().describe("New value for the property"),
    culture: z.string().nullable().optional().describe("Culture code for variant content"),
    segment: z.string().nullable().optional().describe("Segment identifier"),
  })).describe("Fields to update"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  updatedFields: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-page",
  description:
    "Edit content fields on an existing page. Updates only the specified fields — " +
    "other fields are left unchanged. Changes are saved but NOT automatically published. " +
    "You will be asked to confirm the changes before saving.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
  handler: async ({ id, values }, extra) => {
    // Step 1: Fetch current page for context
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);

    const doc = docResult.structuredContent as any;
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";
    const fieldNames = values.map(v => v.alias).join(", ");

    // Step 2: Elicit confirmation
    const elicitResult = await extra.elicit({
      message: `Update ${values.length} field(s) on "${pageName}"?\n\nFields: ${fieldNames}\n\nChanges will be saved but NOT published.`,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm edit",
            description: `Save changes to "${pageName}"`,
            default: true,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !elicitResult.content?.confirm) {
      return createToolResult({ message: "Edit cancelled", id, name: pageName, updatedFields: 0 });
    }

    // Step 3: Update via dev MCP
    const updateResult = await mcpClientManager.callTool("cms", "update-document-properties", {
      id,
      values: values.map(v => ({
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
        editorAlias: v.alias,
      })),
    });

    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Updated ${values.length} field(s) on "${pageName}". Use publish-page to make changes live.`,
      id,
      name: pageName,
      updatedFields: values.length,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 3: Create `delete-page` workflow tool**

Moves to recycle bin with strong confirmation (destructiveHint: true).

```typescript
// src/umbraco-api/tools/content/delete/delete-page.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("ID of the page to delete"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-page",
  description:
    "Delete a content page by moving it to the recycle bin. " +
    "The page can be restored from the recycle bin later if needed. " +
    "You will be asked to confirm before deleting.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
  },
  handler: async ({ id }, extra) => {
    // Step 1: Fetch page details
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);

    const doc = docResult.structuredContent as any;
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation with strong warning
    const elicitResult = await extra.elicit({
      message: `Delete "${pageName}"? This will move it to the recycle bin. It can be restored later, but it will be immediately removed from the live site if published.`,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm delete",
            description: `Move "${pageName}" to the recycle bin`,
            default: false,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !elicitResult.content?.confirm) {
      return createToolResult({ message: "Delete cancelled", id, name: pageName });
    }

    // Step 3: Move to recycle bin via dev MCP
    const deleteResult = await mcpClientManager.callTool("cms", "move-to-recycle-bin", { id });

    if (deleteResult.isError) return createToolResultError(deleteResult);

    return createToolResult({
      message: `Moved "${pageName}" to the recycle bin`,
      id,
      name: pageName,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 4: Update content collection index**

Add the new tools to the `tools()` function in `src/umbraco-api/tools/content/index.ts`.

**Step 5: Run compile check**

Run: `npm run compile`
Expected: No errors

**Step 6: Commit**

```
feat: add content workflow tools (create, edit, delete page) with elicitation
```

---

## Task 6: Create Versioning Collection

Build the versioning collection — utility tools to browse version history and a workflow tool for rollback.

**Files:**
- Create: `src/umbraco-api/tools/versioning/index.ts`
- Create: `src/umbraco-api/tools/versioning/get/list-versions.ts`
- Create: `src/umbraco-api/tools/versioning/post/rollback-page.ts`
- Modify: `src/index.ts` — register versioning collection
- Modify: `src/collections.ts` — export versioning collection

**Step 1: Create collection index**

```typescript
// src/umbraco-api/tools/versioning/index.ts
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listVersionsTool from "./get/list-versions.js";
import rollbackPageTool from "./post/rollback-page.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "versioning",
    displayName: "Version History",
    description: "View version history and rollback to previous versions",
    dependencies: ["content"],
  },
  tools: () => [listVersionsTool, rollbackPageTool],
};

export default collection;
```

**Step 2: Create `list-versions` utility tool**

```typescript
// src/umbraco-api/tools/versioning/get/list-versions.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("ID of the page to get version history for"),
  take: z.number().optional().default(10).describe("Number of versions to return"),
  skip: z.number().optional().default(0).describe("Number of versions to skip"),
};

const outputSchema = z.object({
  pageName: z.string(),
  versions: z.array(z.object({
    versionId: z.string(),
    date: z.string(),
    user: z.string().optional(),
    isCurrentPublished: z.boolean().optional(),
    isCurrentDraft: z.boolean().optional(),
  })),
  total: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-versions",
  description: "View the version history of a content page. Shows when each version was created and by whom.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async ({ id, take, skip }) => {
    // Fetch page name for context
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    const doc = docResult.structuredContent as any;
    const pageName = doc?.variants?.[0]?.name ?? doc?.name ?? "Unknown";

    // Fetch versions
    const result = await mcpClientManager.callTool("cms", "get-document-version", {
      documentId: id,
      take,
      skip,
    });

    if (result.isError) return createToolResultError(result);

    const data = result.structuredContent as any;
    return createToolResult({
      pageName,
      versions: (data.items ?? []).map((v: any) => ({
        versionId: v.id,
        date: v.date ?? v.updateDate ?? "Unknown",
        user: v.user?.name,
        isCurrentPublished: v.isCurrentPublishedVersion,
        isCurrentDraft: v.isCurrentDraftVersion,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 3: Create `rollback-page` workflow tool**

```typescript
// src/umbraco-api/tools/versioning/post/rollback-page.ts
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  versionId: z.string().uuid().describe("The version ID to rollback to (get this from list-versions)"),
  culture: z.string().optional().describe("Culture code if rolling back a specific language variant"),
};

const outputSchema = z.object({
  message: z.string(),
  versionId: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "rollback-page",
  description:
    "Rollback a content page to a previous version. Use list-versions first to find the version ID you want to restore. " +
    "You will be asked to confirm before rolling back.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
  },
  handler: async ({ versionId, culture }, extra) => {
    // Step 1: Elicit confirmation
    const elicitResult = await extra.elicit({
      message: `Rollback to version ${versionId}? This will replace the current draft with the content from that version. The current published version is not affected until you publish again.`,
      requestedSchema: {
        type: "object" as const,
        properties: {
          confirm: {
            type: "boolean" as const,
            title: "Confirm rollback",
            description: "Restore this previous version as the current draft",
            default: false,
          },
        },
      },
    });

    if (elicitResult.action !== "accept" || !elicitResult.content?.confirm) {
      return createToolResult({ message: "Rollback cancelled", versionId });
    }

    // Step 2: Execute rollback
    const args: Record<string, unknown> = { id: versionId };
    if (culture) args.culture = culture;

    const result = await mcpClientManager.callTool("cms", "create-document-version-rollback", args);

    if (result.isError) return createToolResultError(result);

    return createToolResult({
      message: `Rolled back to version ${versionId}. The restored content is now the current draft — use publish-page to make it live.`,
      versionId,
    });
  },
};

export default withStandardDecorators(tool);
```

**Step 4: Register in `src/index.ts` and `src/collections.ts`**

Add `versioningCollection` to both.

**Step 5: Run compile check**

Run: `npm run compile`
Expected: No errors

**Step 6: Commit**

```
feat: add versioning collection with list-versions and rollback tools
```

---

## Task 7: Update Hosted Worker Entry Point

Keep the hosted worker in sync with the stdio entry point.

**Files:**
- Modify: `src/worker.ts` — register content, publishing, and versioning collections
- Modify: `src/collections.ts` — ensure all collections are properly exported

**Step 1: Update `src/collections.ts`**

Ensure it exports all three Phase 1 collections plus the mode/slice registries:

```typescript
import contentCollection from "./umbraco-api/tools/content/index.js";
import publishingCollection from "./umbraco-api/tools/publishing/index.js";
import versioningCollection from "./umbraco-api/tools/versioning/index.js";

export const collections = [contentCollection, publishingCollection, versioningCollection];

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";
```

**Step 2: Verify `src/worker.ts` imports from `./collections.js`**

The worker already imports collections from `./collections.js` — verify it picks up the new collections without changes.

**Step 3: Run compile check**

Run: `npm run compile`
Expected: No errors

**Step 4: Commit**

```
feat: sync hosted worker with Phase 1 collections
```

---

## Task 8: Integration Tests

Write integration tests for the content, publishing, and versioning tools. These run against a real Umbraco instance.

**Files:**
- Create: `src/umbraco-api/tools/content/__tests__/content.test.ts`
- Create: `src/umbraco-api/tools/publishing/__tests__/publishing.test.ts`
- Create: `src/umbraco-api/tools/versioning/__tests__/versioning.test.ts`

**Step 1: Create content integration test**

Test search-content, get-page, browse-children, create-page, edit-page, delete-page against the real Umbraco instance. Use `setupTestEnvironment()` helper. Create test data, run tools, verify results, clean up.

Key test scenarios:
- `search-content` returns results for known content
- `get-page` returns page details with values
- `browse-children` returns root pages and child pages
- `create-page` creates a draft (requires elicitation mock/bypass for tests)
- `edit-page` updates fields
- `delete-page` moves to recycle bin

**Step 2: Create publishing integration test**

- `publish-page` publishes a draft page
- `unpublish-page` unpublishes a published page

**Step 3: Create versioning integration test**

- `list-versions` returns version history
- `rollback-page` restores a previous version

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```
test: add integration tests for Phase 1 content, publishing, and versioning
```

---

## Task 9: Eval Tests

Write LLM eval tests that verify an AI can use the editor tools for common workflows.

**Files:**
- Create: `tests/evals/content-workflows.test.ts`

**Step 1: Create eval test file**

Test scenarios using `runScenarioTest`:

1. **Find and read content**: "Find the blog post about getting started and show me its content"
   - Required tools: `search-content`, `get-page`

2. **Browse site structure**: "Show me what pages are at the top level of the site"
   - Required tools: `browse-children`

3. **Create and publish flow**: "Create a new blog post called 'AI in CMS' and publish it"
   - Required tools: `create-page`, `publish-page`

4. **Edit content**: "Update the title on the About page"
   - Required tools: `search-content`, `edit-page`

5. **Version rollback**: "Show me the version history of the homepage and rollback to the previous version"
   - Required tools: `list-versions`, `rollback-page`

**Step 2: Run evals**

Run: `npm run test:evals`
Expected: Evals pass (may need iteration on tool descriptions)

**Step 3: Commit**

```
test: add LLM eval tests for editor content workflows
```

---

## Phases 2-7 (High-Level Outlines)

### Phase 2: Media + Blueprints

**Media collection:**
- `browse-media` — browse media library tree (utility)
- `search-media` — search media by name (utility)
- `get-media-details` — get media item details and URLs (utility)
- `upload-media` — upload media with elicitation for folder selection (workflow)
- `delete-media` — delete with confirmation (workflow)

**Blueprints collection:**
- `list-blueprints` — list available content blueprints (utility)
- `create-page-from-blueprint` — create page using blueprint as template (workflow)

### Phase 3: Translation + Tags

**Translation collection:**
- `list-languages` — show available languages (utility)
- `find-missing-translations` — identify content missing language variants (utility)
- `create-translation-variant` — create translation draft for a page (workflow)

**Tags collection:**
- `list-tags` — list all tags with usage counts (utility)
- `find-duplicate-tags` — identify similar/duplicate tags (utility)
- `consolidate-tags` — merge duplicate tags with confirmation (workflow)

### Phase 4: Health + SEO + Reporting

**Health collection:**
- `check-content-health` — scan for missing fields, broken media refs, stale content (utility)
- `find-stale-content` — find content not updated in N days (utility)

**SEO collection:**
- `audit-seo` — check for missing meta descriptions, alt text, URL issues (utility)
- `fix-seo-issues` — bulk update SEO fields with confirmation (workflow)

**Reporting collection:**
- `recently-published` — show content published in a date range (utility)
- `content-by-status` — group content by draft/published/unpublished (utility)
- `content-review-due` — find content not reviewed in N days (utility)

### Phase 5: Redirects + Search

**Redirects collection:**
- `list-redirects` — show URL redirects (utility)
- `create-redirect` — add redirect with confirmation (workflow)
- `delete-redirect` — remove redirect with confirmation (workflow)

**Search collection:**
- `check-search-index` — verify content is indexed (utility)
- `search-quality-report` — compare search results vs expectations (utility)

### Phase 6: Bulk Operations

**Bulk operations collection:**
- `bulk-update-field` — update a field across multiple pages matching criteria (workflow, heavy elicitation: preview changes → confirm)
- `bulk-publish` — publish multiple pages with confirmation (workflow)
- `bulk-unpublish` — unpublish multiple pages with confirmation (workflow)
- `bulk-move` — move multiple pages to new parent (workflow)

Depends on patterns from all prior phases. Key design: dry run mode shows changes before executing.

### Phase 7: Members + Scheduling

**Members collection:**
- `search-members` — find members by name/email (utility)
- `get-member-details` — view member profile (utility)
- `manage-member-groups` — add/remove member from groups (workflow)

**Scheduling collection:**
- `list-scheduled` — show upcoming publish/unpublish schedule (utility)
- `schedule-publish` — schedule future publish date with confirmation (workflow)
- `schedule-unpublish` — schedule future unpublish with confirmation (workflow)
