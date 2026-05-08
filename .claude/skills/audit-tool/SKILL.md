---
name: audit-tool
description: Live-validate a single Editor MCP tool through the running .mcp.json — invoke it for real, verify post-state, record the finding. Use after adding or modifying a tool, or when investigating a suspected upstream regression. Closes the gap between "integration tests pass" and "live MCP works", which the audit campaign in docs/audits/mcp-live-validation/ exposed.
user_invocable: true
---

# Audit Tool

Run a single Editor MCP tool live through the `.mcp.json` editor connection (the same path real users hit), verify the side-effect actually landed, and record the result. Catches the class of failures the integration-test suite misses by design — schema mismatches at the wire layer, transport timeouts, response masking, demo-site staleness.

Use this skill when:
- A new tool was just added (`umbraco-mcp-skills:add-tool` finished, or a manual edit landed)
- A tool was modified and you want to confirm it still behaves correctly end-to-end
- Investigating a suspected upstream regression (Umbraco version bump, dev MCP update, etc.)

## When NOT to use this

- For broad coverage across all tools — use the audit-folder pattern (`docs/audits/mcp-live-validation/`) and walk every tool. The skill is for one-tool-at-a-time validation.
- To replace integration tests — those still run in CI. This is a separate end-to-end signal.
- For evals — those test LLM workflow fitness, different concern.

## Prerequisites

1. **Local Umbraco running.** `npm run start:umbraco` if not. Check `.demo-site-port` for the port.
2. **Editor MCP connected** in this Claude Code session — `mcp__umbraco-editor__*` tools available. If not, `/mcp` to reconnect, or restart Claude Code.
3. **`UMBRACO_AUTO_CONFIRM` not set** in `.mcp.json` for normal auditing — confirmation prompts on destructive ops are part of what we're validating. Only set it when batch-running (the historical audit campaign did).

## Arguments

- **Tool name** (required): the editor tool to audit, e.g. `delete-page`. The `mcp__umbraco-editor__` prefix is added automatically.
- **Mode** (optional): `quick` (single happy-path call), `thorough` (happy + 1-2 edge cases), or `full` (every code path, deferred-fixture cleanup at the end). Default: `quick`.

## Procedure

### 1 — Read the tool source

Open `src/umbraco-api/tools/<collection>/<verb>/<tool-name>.ts`. Note:

- `inputSchema` — what arguments are required, what UUIDs are picky, defaults
- `outputSchema` — what shape the response must satisfy (the wire boundary will reject anything that doesn't)
- `annotations.destructiveHint` and `confirmStep(...)` calls — destructive tools need fixtures
- Any `chainCms("<chained-tool>", ...)` calls — these are the upstream surface that's most likely to drift

If the tool has any `// AUDIT-...` comments from previous audits, read those too — they often encode known constraints.

### 2 — Pick a target

| Tool kind | What to do |
|-----------|------------|
| Destructive (`destructiveHint: true` or `confirmStep` present) | **Always create a fresh fixture first** via the relevant create tool (e.g. `create-page` for content, `create-media-folder` for media, `create-member` + `create-member-group` for members). Never act on real demo content. |
| Non-destructive write (`edit-*`, `update-*`, `sort-*`, `upload-media`, `set-*`) | Also create a sacrificial fixture. Don't edit Home or other real content. |
| Pure read | Pick something stable (Home, a known doc type, etc.), or a fixture if the tool needs known data to be exercised meaningfully. |

For destructive ops, plan the cleanup before you start: how will the fixture be removed at the end?

### 3 — Verify the bypass state

If the tool elicits confirmation (any destructive op), expect a prompt to fire when you call it. The user must accept it for the call to proceed. If you're batching many calls and want to skip prompts, set `UMBRACO_AUTO_CONFIRM=true` in `.mcp.json` AND restart the MCP subprocess (Claude Code's `/mcp` reconnect doesn't restart). For a one-off audit, leave the prompt firing — you're validating that flow too.

### 4 — Make the call

Invoke `mcp__umbraco-editor__<tool-name>` with the prepared arguments. Note the response — capture it verbatim if possible.

### 5 — Verify the post-state

Re-read the affected resource via a *different* tool to confirm the side-effect actually landed. Examples:

| You ran | Verify with |
|---------|-------------|
| `publish-page` | `get-publish-status` → `isPublished: true` |
| `unpublish-page` | `get-publish-status` → `isPublished: false` |
| `delete-page` | `list-recycle-bin type=content` → page appears |
| `restore-page` | `list-recycle-bin` → page is gone, `list-children` of target parent → page is back |
| `set-page-template` | `list-page-templates` → `current` matches |
| `schedule-publish` | `get-publish-status` → `scheduledPublishDate` set |
| `cancel-schedule` | `get-publish-status` → `scheduledPublishDate: null` |
| `set-public-access` | `get-public-access` → `hasRestrictions: true`, groups match |
| `bulk-set-property` | `get-page` → property reflects new value |
| `create-member` (with groups) | `get-member` → groups contains the id |
| `delete-member` | `get-member` → 404 |
| `delete-redirect` | `list-redirects` → entry is gone |
| `move-media` / `bulk-move-media` | `list-media-children` of target folder |

For a finding to be ✅, both the tool's own response **and** the post-state read must agree.

### 6 — Classify the result

| Status | Criteria |
|--------|----------|
| ✅ pass | Tool reports success and post-state confirms |
| ❌ fail | Tool errors, OR post-state contradicts the response (e.g. "Restored" but page still in bin) |
| ⚠️ wrong-but-not-erroring | Response shape looks fine but content is misleading (`from "Unknown"`, empty `properties: []`, etc.) |
| ⏭ deferred | Couldn't reach the test state safely (e.g. would touch shared content the user didn't grant) |

### 7 — Record the result

The audit folder lives at `docs/audits/mcp-live-validation/` and is **gitignored** — it's a working scratchpad, not a deliverable. The durable record of any audit is the regression tests + git history; this folder is just for in-flight findings.

If the folder doesn't exist yet, create it from the templates bundled with this skill:

- `.claude/skills/audit-tool/templates/README.md` → `docs/audits/mcp-live-validation/README.md`
- `.claude/skills/audit-tool/templates/results.md` → `docs/audits/mcp-live-validation/results.md`

For each ❌ or ⚠️ finding, copy `.claude/skills/audit-tool/templates/failure.md` to `docs/audits/mcp-live-validation/failures/<tool-name>.md` and fill it in. The template covers:

- Tool, source path, status
- Live call inputs (exact arguments)
- Expected outcome (per the tool's description and integration test intent)
- Actual outcome (verbatim error or response, plus post-state from re-read)
- Reproducibility (Always / Intermittent / Once-only with retry count)
- Suspected cause (hypothesis linking symptom to a code region)
- Repro recipe (minimum sequence of MCP calls to reproduce)
- Notes for the fix campaign

For ✅ rows, just update `results.md` — no detail file needed.

### 8 — Clean up

Remove every fixture you created. For pages: `delete-page` + `permanent-delete-recycle-bin-item`. For media: `delete-media` + permanent-delete (type=media). For members: `delete-member`, `delete-member-group`. For dictionaries and blueprints: there's no MCP delete tool today — note the leftover in the audit doc and clean up via the backoffice if it matters.

The demo site should round-trip clean — same shape after the audit as before.

## Output expected

A single-paragraph summary back to the user:
- The tool, its status, and one-line outcome
- For ❌ / ⚠️: the specific symptom and the failures/<tool>.md path
- Cleanup state (any fixtures left behind, with reasons)

## Reference: prior audit campaign

The first systematic audit campaign produced 11 fixes (rollback-page, restore-page, report-member-{count,activity}, create-blueprint, delete-redirect, list-document-types, get-document-type, list-media-types, list-dictionary, create-member groups) plus the member sensitive-data gate finding. That campaign's commits are on the `feature/test-determinism` branch / PR — search the git log for `audit:` and `fix(audit):` for the lifecycle.

## Reference: `callTool` test helper

For new tests added alongside fixes (regression tests), use `callTool(tool, args, extra)` from `src/testing/call-tool-with-validation.ts` instead of `tool.handler(args, extra)`. It runs the response through the tool's `outputSchema` — the same validation the live MCP transport does. That's how `report-member-count`'s schema bug would have been caught at integration-test time rather than only live.

## Reference: scripted batch harness

The in-conversation flow above is for one tool at a time, with you in the loop. For batch validation of a focused set of related tools (a PR, a feature, a regression hunt), there's a complementary scripted pattern — spawn `dist/index.js` as a subprocess and drive it over stdio JSON-RPC from a `.mjs` file. Two worked examples live in `scripts/`:

- **`scripts/audit-block-tools.mjs`** — drives the block-editing tools added in PR #42 (`add-blocklist-block`, `add-blockgrid-block`, `add-rte-block`, `edit-block`) through `dist/index.js`. Auto-accepts `elicitation/create` requests with schema defaults so destructive confirmations don't block the run. Records each finding as PASS / FAIL / WARN.
- **`scripts/provision-block-donors.mjs`** — sets up the donor doc types and pages (`BlockGrid` page, RTE-with-blocks doc type) the audit harness needs. Uses `--cleanup` to tear down. Talks to `@umbraco-cms/mcp-dev` directly so it doesn't need the Editor MCP wired in.

Both read `.demo-site-port` and `.env` from the working directory, so they only run against your local instance. They are deliberately not generalised — copy and adapt for the next PR's tools rather than trying to parameterise the originals.

When to reach for this pattern over the in-conversation flow:

- A PR adds 3+ related tools and you want a reproducible end-to-end check before merging
- Investigating a regression where the failure mode is "sometimes" — a script can repeat the call
- You want the audit reproducible by a teammate without their having to drive it interactively

When to stick with the in-conversation flow:

- One tool, one run
- Exploratory — you want to read each response before deciding what to call next
- Anything where you don't want elicitation auto-accepted (the script bypass is destructive-by-default)
