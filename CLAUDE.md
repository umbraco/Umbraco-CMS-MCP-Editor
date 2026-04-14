# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Umbraco Editor MCP server.

## Project Overview

MCP server that gives AI assistants editorial control over Umbraco CMS content. 75+ tools across 21 collections covering content editing, media management, publishing, translation, bulk operations, members, reporting, and more. Tools delegate to the Umbraco CMS via MCP chaining — this server wraps the lower-level CMS dev tools with editor-friendly interfaces, confirmations, and LLM-optimised responses.

Runs as a local stdio MCP server or as a hosted Cloudflare Worker with OAuth.

## Gitflow

- `dev` — integration branch, all feature branches merge here
- `main` — release branch, only merged from `dev`
- Feature branches: `feature/<name>` (auto-prefixed by worktree hook)

## Git Worktrees

This project uses git worktrees for feature work. Use `EnterWorktree` to create or enter a worktree — hooks in `.claude/settings.json` handle everything automatically:

- `.env` is copied from the main repo (API credentials)
- A new SQL Server database is created (`umbraco-mcp-editor-<slug>`)
- `demo-site/appsettings.local.json` is written with the worktree database connection string
- `demo-site/Properties/launchSettings.json` is rewritten to use a dynamic port (port 0)
- `npm install` runs automatically

First `dotnet run` in a new worktree triggers Umbraco unattended install in the new database.

**Running the demo site in a worktree:**

`npm run start:umbraco` — starts Umbraco on a random available port. The port is written to `.demo-site-port` and `UMBRACO_BASE_URL` in `.env` is updated automatically.

**Cleanup:**

Use `ExitWorktree` with remove action, or the `/cleanup` skill. The hook drops the worktree database and removes the worktree directory.

## Commands

```bash
npm run build          # Build with tsup
npm run compile        # Type-check only
npm run generate       # Generate API client from OpenAPI spec (Orval)
npm run inspect        # Run MCP inspector
npm run test           # Unit tests only
npm run test:evals     # LLM eval tests (requires Claude Code subscription or ANTHROPIC_API_KEY)
npm run test:all       # Both unit and eval tests
npm run test:e2e       # Playwright E2E tests for hosted worker
```

**Single test:** `npm test -- --testPathPattern=src/path/__tests__/file.test.ts`

**Always use npm scripts** (`npm run compile`, `npm test`, `npm run build`) — never run `node`, `npx tsc`, or `jest` directly.

## Source Structure

```
src/
├── umbraco-api/
│   ├── api/
│   │   ├── client.ts          # API client configuration
│   │   └── generated/         # Orval-generated client and Zod schemas
│   ├── tools/
│   │   └── {collection-name}/
│   │       ├── index.ts       # ToolCollectionExport
│   │       ├── get/           # GET tools (read-only)
│   │       ├── post/          # POST tools (create/action)
│   │       ├── put/           # PUT tools (update)
│   │       ├── delete/        # DELETE tools
│   │       └── __tests__/     # Integration tests
│   ├── mcp-client.ts          # MCP chaining client (singleton)
│   └── helpers/               # Shared helpers (bulk-handler, tree-walker)
├── config/
│   ├── index.ts               # Exports all config
│   ├── server-config.ts       # Custom config field definitions
│   ├── slice-registry.ts      # Valid slice names for tool filtering
│   ├── mode-registry.ts       # Mode-to-collection mappings
│   └── mcp-servers.ts         # Chained MCP server configs
├── worker.ts                  # Cloudflare Worker entry point (hosted deployment)
├── testing/                   # Test helpers specific to this project
└── index.ts                   # Stdio server entry point
tests/
└── evals/
    ├── jest.config.ts         # Separate Jest config for evals
    ├── helpers/
    │   └── e2e-setup.ts       # configureEvals setup (loaded via setupFilesAfterEnv)
    └── *.test.ts              # LLM eval test files
docs/
├── specs/                     # Design specs for each phase
└── plans/                     # Implementation plans for each phase
```

## Architecture: MCP Chaining

Tools in this server do **not** call the Umbraco API directly. They delegate to the `@umbraco-cms/mcp-dev` MCP server via chaining:

```
AI Client → Editor MCP (this server) → CMS Dev MCP (@umbraco-cms/mcp-dev) → Umbraco API
```

- `mcpClientManager.callTool("cms", "tool-name", { ... })` calls a chained CMS tool
- `extractChainedResult(result)` unwraps the response
- In stdio mode, the CMS server runs as a subprocess
- In hosted mode (worker.ts), the CMS server runs in-process via a client factory

## Tool Collections (21)

| Domain | Collections |
|--------|------------|
| Content | `content`, `publishing`, `versioning` |
| Media | `media`, `media-management`, `media-health` |
| Structure | `blueprint`, `site-structure`, `tag`, `dictionary`, `redirect` |
| Translation | `language`, `translation` |
| Bulk | `bulk-operations` |
| Members | `member`, `member-group`, `member-reporting` |
| Health & Reporting | `content-health`, `content-reporting` |
| Scheduling | `scheduling` |
| Utilities | `helpers` (not exposed — shared code for bulk-handler, tree-walker) |

## Configuration

**Environment Variables / CLI Flags:**

| Variable | CLI Flag | Purpose |
|----------|----------|---------|
| `UMBRACO_CLIENT_ID` | `--umbraco-client-id` | OAuth client ID |
| `UMBRACO_CLIENT_SECRET` | `--umbraco-client-secret` | OAuth client secret |
| `UMBRACO_BASE_URL` | `--umbraco-base-url` | Umbraco instance URL |
| `UMBRACO_TOOL_MODES` | `--umbraco-tool-modes` | Comma-separated modes |
| `UMBRACO_INCLUDE_SLICES` | `--umbraco-include-slices` | Include only these slices |
| `UMBRACO_EXCLUDE_SLICES` | `--umbraco-exclude-slices` | Exclude these slices |
| `UMBRACO_READONLY` | `--umbraco-readonly` | Block write operations |
| `DISABLE_MCP_CHAINING` | `--disable-mcp-chaining` | Disable MCP server chaining |

Custom fields defined in `config/server-config.ts`.

## Modes and Slices

**Modes** (`config/mode-registry.ts`) — named groups of collections users enable via `UMBRACO_TOOL_MODES`:
- `content`, `media`, `blueprints`, `translation`, `tags`, `content-health`, `site-structure`, `media-health`, `bulk-operations`, `members`, `scheduling`, `redirects`

**Slices** (`config/slice-registry.ts`) — operation-type categories for fine-grained filtering:
- Base: `create`, `read`, `update`, `delete`, `list`
- Extended: `tree`, `search`, `publish`, `version`, `move`
- Tools with empty slices array are categorised as `other`

## Tool Conventions

- One file per tool in operation-type subfolder (`get/`, `post/`, etc.)
- Export default with `withStandardDecorators(tool)`
- Input/output schemas use Zod — hand-written for clarity, not generated
- Use `mcpClientManager.callTool("cms", ...)` to call chained CMS tools
- Use `extractChainedResult(result)` to unwrap chained responses
- Use `confirmAction(extra, message, { title, defaultValue })` for write operations
- Set `slices` array for filtering categorisation
- Set `annotations` for MCP hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`)

## Shared Helpers

**`helpers/bulk-handler.ts`** — shared bulk operation infrastructure:
- `validateBulkIds(ids)` — enforces 10-item cap
- `fetchBulkItemDetails(ids)` — fetches page names and version IDs for confirmation/rollback
- `executeBulkSequentially(items, fn)` — sequential fail-fast execution
- `buildBulkOutput(verb, results)` — aggregates success/failure/skipped counts

**Block detection** (used by inspect-blocks, edit-block, bulk-set-block-property):
- `isBlockListOrGridValue(value)` — detects BlockList/BlockGrid content
- `isRteWithBlocks(value)` — detects Rich Text with embedded blocks
- `findMatchingBlocks(doc, propertyAlias, contentTypeKey)` — finds blocks by element type

## Testing

**Integration tests (`__tests__/`):**
- Run against a real Umbraco instance — no mocking
- Require a running Umbraco instance with an API user configured (see below)
- Call `setupTestEnvironment()` in describe block
- Use `setupEditorElicitation(jest.fn)` from `src/testing/setup-elicitation.ts` for write operations (NOT `setupElicitationMock` from the SDK — it doesn't set the server ref needed by `confirmAction`)
- Use `getStructuredContent(result)` to extract typed output
- Tests must create their own state — never skip because data doesn't exist. If a create fails, search for existing items as fallback
- **Never rely on pre-existing Umbraco data** — CI runs against a fresh Umbraco install with only the demo site. Tests that snapshot list/report results from existing content will fail on CI because the data differs from local dev. Every test must use builders to create the specific data it needs, then snapshot/assert against that known data, and clean up afterwards
- **Snapshot tests must be deterministic** — only snapshot data the test created itself. Use `createSnapshotResult()` with the created item's ID for normalization. For tools that report on all content (list-children, report-short-content, etc.), create test data, run the tool, then assert the created item appears in the results — don't snapshot the entire result
- Clean up by ID (via `ContentTestHelper.cleanupById`) not by name search — name search can fail with large datasets
- **Always run tests locally first** (`npm test`) and verify they pass before pushing to CI. Fix failures locally, don't rely on CI for iteration

**Eval tests (`tests/evals/`):**
- LLM-based acceptance tests using Claude Agent SDK
- Require Claude Code subscription or `ANTHROPIC_API_KEY`
- Use `runScenarioTest` with prompt, tools, requiredTools, successPattern
- Each eval file has an `allTools` array — new tools must be added to all eval files
- Separate Jest config at `tests/evals/jest.config.ts`
- Setup loaded automatically via `setupFilesAfterEnv` (no per-file import needed)
- Run with `--runInBand` to avoid parallel API calls

## API User Setup

Integration tests require an API user in Umbraco. **You must create this manually via the Umbraco backoffice UI:**

1. Go to **Settings > Users** in the Umbraco backoffice
2. Create an API user with:
   - **Client ID:** `umbraco-back-office-mcp`
   - **Client Secret:** `1234567890`
3. Grant the user appropriate permissions for the APIs being tested
4. Add these to your `.env` file:
   ```
   UMBRACO_CLIENT_ID=umbraco-back-office-mcp
   UMBRACO_CLIENT_SECRET=1234567890
   ```

## Hosted Worker (`src/worker.ts`)

Cloudflare Worker entry point for hosted deployment:

- `McpAgent.serve("/mcp", { binding: "MCP_AGENT" })` — use `.serve()` for Streamable HTTP (NOT `.mount()` which is SSE)
- CMS server registered as in-process (not subprocess) via client factory
- OAuth via `@cloudflare/workers-oauth-provider`
- `new_sqlite_classes` in `wrangler.toml` migrations (agents library requires SQLite-backed DOs)
- `.dev.vars` — local secrets including `UMBRACO_SERVER_URL` for self-signed cert workaround

Run locally: `npx wrangler dev --port 8787`
Test with MCP Inspector in Direct mode: `http://localhost:8787/`
