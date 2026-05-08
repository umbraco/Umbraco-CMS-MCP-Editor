# MCP Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 5 ❌ and 5 ⚠️ findings from the live-MCP audit campaign (`docs/audits/mcp-live-validation/`), each paired with a regression integration test that exercises the live failure mode.

**Architecture:** Per-finding TDD passes. Each task lands one fix + one regression test, in its own commit. Tests use `callTool()` from `src/testing/call-tool-with-validation.ts` so the response is run through the tool's outputSchema (the same gate the live MCP transport applies). No mocking — every test hits a real Umbraco instance via the existing setup helpers.

**Tech Stack:** TypeScript, tsup build, Jest (integration tests), `@umbraco-cms/mcp-server-sdk`, chained `@umbraco-cms/mcp-dev` over stdio.

**Out of scope:** The two pre-existing limitations recorded in `failures/`:
- `shared-empty-upstream-fields.md` — fix lives upstream in `@umbraco-cms/mcp-dev`'s output schemas, not this repo.
- `preview-url-stale-port.md` — environmental (orphan demo-site processes after port changes), not a code defect.

Both are tracked in the audit folder for the record but won't get tasks here.

---

## File Structure

**Modified:**
- `src/umbraco-api/tools/helpers/confirm-step.ts` — already edited; needs commit + regression test
- `src/umbraco-api/tools/redirect/delete/delete-redirect.ts` — not-found guard
- `src/umbraco-api/tools/member/put/update-member.ts` — groups preservation
- `src/umbraco-api/tools/member-reporting/get/report-members-by-group.ts` — name → id resolution
- `src/umbraco-api/tools/member-reporting/get/report-member-count.ts` — merge byGroup rows
- `src/umbraco-api/tools/translation/post/create-variant.ts` — variesByCulture pre-flight
- `src/umbraco-api/tools/translation/post/copy-variant.ts` — same pre-flight
- `src/umbraco-api/tools/content/post/add-blocklist-block.ts` — doctype-driven property lookup
- `src/umbraco-api/tools/content/post/add-blockgrid-block.ts` — same
- `src/umbraco-api/tools/content/post/add-rte-block.ts` — same
- `src/umbraco-api/tools/content/put/restore-page.ts` — switch back to chainCms once upstream is verified, or initialize UmbracoFetch
- `src/umbraco-api/tools/helpers/tree-walker.ts` — extend `extractTextContent` to walk block content + include title field
- `src/umbraco-api/tools/helpers/bulk-handler.ts` — parse nested error JSON before surfacing
- `src/index.ts` — only if Task 9 picks the "initialize UmbracoFetch" path

**Created:**
- `src/umbraco-api/tools/translation/helpers/check-varies-by-culture.ts` — shared pre-flight helper for variant tools
- `src/umbraco-api/tools/helpers/__tests__/confirm-step.test.ts` — bypass regression test
- New regression test cases inside the existing per-tool test files (no new test files where one already exists for the tool)

---

## Task 1: Commit the elicitation bypass with a regression test

**Why:** The bypass in `helpers/confirm-step.ts` is uncommitted but unblocks the rest of the campaign and (more importantly) lets future audit campaigns batch through write tools. Land it first with a unit test that proves the bypass triggers without calling `server.elicitInput`.

**Files:**
- Modify: `src/umbraco-api/tools/helpers/confirm-step.ts` (already edited in pass 2 — confirm + add inline comment)
- Create: `src/umbraco-api/tools/helpers/__tests__/confirm-step.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/umbraco-api/tools/helpers/__tests__/confirm-step.test.ts
import { confirmStep } from "../confirm-step.js";
import { setServerRef } from "@umbraco-cms/mcp-server-sdk";

describe("confirmStep UMBRACO_AUTO_CONFIRM bypass", () => {
  const originalEnv = process.env.UMBRACO_AUTO_CONFIRM;
  let elicitInputCalled = false;

  beforeEach(() => {
    elicitInputCalled = false;
    setServerRef({
      elicitInput: async () => {
        elicitInputCalled = true;
        return { action: "decline" };
      },
    } as any);
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.UMBRACO_AUTO_CONFIRM;
    else process.env.UMBRACO_AUTO_CONFIRM = originalEnv;
  });

  it("returns true without eliciting when UMBRACO_AUTO_CONFIRM=true", async () => {
    process.env.UMBRACO_AUTO_CONFIRM = "true";
    const result = await confirmStep({}, "do you confirm?");
    expect(result).toBe(true);
    expect(elicitInputCalled).toBe(false);
  });

  it("elicits and returns false on decline when bypass disabled", async () => {
    delete process.env.UMBRACO_AUTO_CONFIRM;
    const result = await confirmStep({}, "do you confirm?");
    expect(result).toBe(false);
    expect(elicitInputCalled).toBe(true);
  });

  it("treats values other than 'true' as not-bypassed", async () => {
    process.env.UMBRACO_AUTO_CONFIRM = "1";
    const result = await confirmStep({}, "do you confirm?");
    expect(result).toBe(false);
    expect(elicitInputCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify all three cases**

Run: `npm run test:one -- --testPathPattern='helpers/__tests__/confirm-step'`
Expected: 3/3 pass (the bypass code is already in place from pass 2 of the audit).

- [ ] **Step 3: Verify the source has the bypass + add a brief why-comment**

Confirm `src/umbraco-api/tools/helpers/confirm-step.ts` reads:

```ts
export async function confirmStep(
  extra: { requestId?: string | number } | undefined,
  message: string,
): Promise<boolean> {
  // UMBRACO_AUTO_CONFIRM=true short-circuits the elicit for batch audit campaigns
  // (see docs/audits/mcp-live-validation/). Hosts that don't surface elicitInput
  // would otherwise hang at the MCP -32001 timeout. Leave unset for normal use.
  if (typeof process !== "undefined" && process.env?.UMBRACO_AUTO_CONFIRM === "true") {
    return true;
  }
  const server = getServerRef();
  const result = await server.elicitInput(
    {
      message,
      requestedSchema: { type: "object", properties: {} },
    },
    { relatedRequestId: extra?.requestId },
  );
  return result.action === "accept";
}
```

- [ ] **Step 4: Run the full integration suite to confirm no regressions**

Run: `npm test`
Expected: green (the bypass only fires when env is set).

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/helpers/confirm-step.ts \
        src/umbraco-api/tools/helpers/__tests__/confirm-step.test.ts
git commit -m "feat(audit): UMBRACO_AUTO_CONFIRM bypass for confirmStep

Lets batch audit campaigns run write tools without each elicitInput
hanging at the host. Off by default; set UMBRACO_AUTO_CONFIRM=true in
.env only for batch runs.

Refs: docs/audits/mcp-live-validation/failures/campaign-blocker-elicitation.md"
```

---

## Task 2: delete-redirect — not-found guard

**Files:**
- Modify: `src/umbraco-api/tools/redirect/delete/delete-redirect.ts`
- Modify: `src/umbraco-api/tools/redirect/__tests__/delete-redirect.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/umbraco-api/tools/redirect/__tests__/delete-redirect.test.ts`:

```ts
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import deleteRedirect from "../delete/delete-redirect.js";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

it("returns a 404 error when the id does not match any existing redirect", async () => {
  setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept" }));
  const result = await callTool(
    deleteRedirect,
    { id: "11111111-1111-4111-8111-111111111111" },
    {},
  );
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    status: 404,
    title: expect.stringMatching(/redirect/i),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:one -- --testPathPattern='redirect/__tests__/delete-redirect'`
Expected: FAIL — the tool currently returns success with `originalUrl: "Unknown"`.

- [ ] **Step 3: Add the not-found guard**

Edit `src/umbraco-api/tools/redirect/delete/delete-redirect.ts`. After the `match` lookup (around line 33), insert the guard before the confirmation step:

```ts
const listResult = await chainCms("get-all-redirects", {
  cursor: encodeCursor({ s: 0, t: 100 }),
});
if (!listResult.ok) return listResult.errorResult;

const match = (listResult.data.items ?? []).find((r: any) => r.id === id);
if (!match) {
  return createToolResultError({
    status: 404,
    title: "Redirect not found",
    detail: `No redirect found with id ${id}. Use list-redirects to see existing redirect IDs.`,
  });
}

const m = match as { originalUrl?: string; url?: string; destinationUrl?: string; destinationPath?: string };
const originalUrl = m.originalUrl ?? m.url ?? "Unknown";
const destinationUrl = m.destinationUrl ?? m.destinationPath ?? "Unknown";
```

Also remove the now-redundant `let originalUrl = "Unknown"; let destinationUrl = "Unknown";` declarations and the surrounding `if (listResult.ok) { ... }` wrapper.

Add `createToolResultError` to the imports if not already present:

```ts
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
```

- [ ] **Step 4: Run the test**

Run: `npm run test:one -- --testPathPattern='redirect/__tests__/delete-redirect'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/redirect/delete/delete-redirect.ts \
        src/umbraco-api/tools/redirect/__tests__/delete-redirect.test.ts
git commit -m "fix(audit): delete-redirect 404s when id is unknown

Was returning a 'Deleted redirect from \"Unknown\"' false-success when
the id didn't match any existing redirect. Guard against the lookup
miss before the chained delete.

Refs: docs/audits/mcp-live-validation/failures/delete-redirect-false-success.md"
```

---

## Task 3: update-member — preserve groups when not supplied

**Files:**
- Modify: `src/umbraco-api/tools/member/put/update-member.ts`
- Modify: `src/umbraco-api/tools/member/__tests__/update-member.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/umbraco-api/tools/member/__tests__/update-member.test.ts` (use the existing builders/helpers):

```ts
it("preserves existing group memberships when groups is not in the payload", async () => {
  setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept" }));

  const group = await memberGroupHelper.create({ name: "preserve-groups-test" });
  const member = await memberHelper.create({
    name: "Preserve Groups Member",
    email: `preserve-${Date.now()}@example.com`,
    username: `preserve-${Date.now()}`,
    password: "Auditpw123!",
    memberTypeId: testFixtures.memberTypeId,
    groups: [group.id],
  });

  const result = await callTool(
    updateMember,
    { id: member.id, name: "Renamed Member" },  // intentionally no `groups`
    {},
  );
  expect(result.isError).toBeFalsy();

  const fresh = await memberHelper.getById(member.id);
  expect(fresh.groups).toContain(group.id);

  await memberHelper.cleanupById(member.id);
  await memberGroupHelper.cleanupById(group.id);
});
```

(Reuse whatever import/setup pattern the surrounding tests in the file use. If those tests don't already import `callTool` and `setupEditorElicitation`, add them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:one -- --testPathPattern='member/__tests__/update-member'`
Expected: FAIL — fresh.groups will be empty after the rename.

- [ ] **Step 3: Fix the source**

Edit `src/umbraco-api/tools/member/put/update-member.ts:74`:

```ts
// Before:
if (groups !== undefined) data.groups = groups;

// After:
data.groups = groups ?? member.groups ?? [];
```

This matches the fallback pattern used for `variants`, `values`, `username`, `email`, etc. on the surrounding lines.

- [ ] **Step 4: Run the test**

Run: `npm run test:one -- --testPathPattern='member/__tests__/update-member'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/member/put/update-member.ts \
        src/umbraco-api/tools/member/__tests__/update-member.test.ts
git commit -m "fix(audit): update-member preserves groups when not supplied

The 'only set if defined' pattern was unique to the groups field —
every other optional field falls back to the existing fetched value.
Caller-omits-groups was being interpreted as 'set to empty'.

Refs: docs/audits/mcp-live-validation/failures/update-member-strips-groups.md"
```

---

## Task 4: report-members-by-group — resolve group name to id

**Files:**
- Modify: `src/umbraco-api/tools/member-reporting/get/report-members-by-group.ts`
- Modify: `src/umbraco-api/tools/member-reporting/__tests__/report-members-by-group.test.ts`

- [ ] **Step 1: Write the failing test**

Append a regression test that creates a group + a member assigned to it, then calls the report and asserts the member is found by group name:

```ts
it("returns members assigned to a group by name", async () => {
  const group = await memberGroupHelper.create({ name: `report-group-${Date.now()}` });
  const member = await memberHelper.create({
    name: "Report Group Member",
    email: `report-${Date.now()}@example.com`,
    username: `report-${Date.now()}`,
    password: "Auditpw123!",
    memberTypeId: testFixtures.memberTypeId,
    groups: [group.id],
  });

  const result = await callTool(
    reportMembersByGroup,
    { groupName: group.name },
    {},
  );

  const items = result.structuredContent.items;
  expect(items.some((m: any) => m.id === member.id)).toBe(true);
  expect(result.structuredContent.total).toBeGreaterThan(0);

  await memberHelper.cleanupById(member.id);
  await memberGroupHelper.cleanupById(group.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:one -- --testPathPattern='member-reporting/__tests__/report-members-by-group'`
Expected: FAIL — items is empty because the filter compares the supplied name against UUIDs in `m.groups`.

- [ ] **Step 3: Fix the source**

Edit `src/umbraco-api/tools/member-reporting/get/report-members-by-group.ts`. Resolve the group name to a group id up front, then filter on id:

```ts
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

// ... existing schemas unchanged ...

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-members-by-group",
  description: "List members belonging to a specific group. Use list-member-groups to find valid group names.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ groupName, take, skip }) => {
    // Resolve the group name → id; m.groups stores ids, not names.
    const groupsResult = await chainCms("get-all-member-groups", { cursor: undefined });
    if (!groupsResult.ok) return groupsResult.errorResult;
    const groupMatch = (groupsResult.data.items ?? []).find(
      (g: any) => g.name?.toLowerCase() === groupName.toLowerCase(),
    );
    if (!groupMatch) {
      return createToolResultError({
        status: 404,
        title: "Member group not found",
        detail: `No member group named "${groupName}". Use list-member-groups to see existing group names.`,
      });
    }
    const groupId = groupMatch.id;

    const result = await chainCms("find-member", {
      memberGroupName: groupName,
      cursor: buildChainedCursor(skip, take),
      orderBy: "username",
    });
    if (!result.ok) return result.errorResult;
    const data = result.data;
    const items: any[] = data.items ?? [];

    const filtered = items.filter((m: any) => {
      const groups: string[] = m.groups ?? [];
      return groups.includes(groupId);
    });

    return createToolResult({
      groupName,
      items: filtered.map((m: any) => ({
        id: m.id ?? "",
        name: m.variants?.[0]?.name ?? "Unknown",
        email: m.email ?? "",
        isApproved: m.isApproved ?? false,
        lastLoginDate: m.lastLoginDate ?? null,
      })),
      total: filtered.length,
    });
  },
};

export default withStandardDecorators(tool);
```

(If `get-all-member-groups` isn't the correct chained tool name, check `node_modules/@umbraco-cms/mcp-dev` exports for the actual name during implementation. The reasoning is the same regardless of the tool name.)

- [ ] **Step 4: Run the test**

Run: `npm run test:one -- --testPathPattern='member-reporting/__tests__/report-members-by-group'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/member-reporting/get/report-members-by-group.ts \
        src/umbraco-api/tools/member-reporting/__tests__/report-members-by-group.test.ts
git commit -m "fix(audit): report-members-by-group filters by id, not name

m.groups stores group ids (uuids), not names — the previous filter
compared the user-supplied name string against uuids and never matched.
Resolve the name to an id first, then filter.

Refs: docs/audits/mcp-live-validation/failures/report-members-by-group.md"
```

---

## Task 5: report-member-count — merge byGroup rows by id

**Files:**
- Modify: `src/umbraco-api/tools/member-reporting/get/report-member-count.ts`
- Modify: `src/umbraco-api/tools/member-reporting/__tests__/report-member-count.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("aggregates byGroup by group name, never by uuid", async () => {
  const group = await memberGroupHelper.create({ name: `count-group-${Date.now()}` });
  const member = await memberHelper.create({
    name: "Count Group Member",
    email: `count-${Date.now()}@example.com`,
    username: `count-${Date.now()}`,
    password: "Auditpw123!",
    memberTypeId: testFixtures.memberTypeId,
    groups: [group.id],
  });

  const result = await callTool(reportMemberCount, {}, {});
  const byGroup = result.structuredContent.byGroup;

  // Every row's "group" field should be a name, never a uuid.
  for (const row of byGroup) {
    expect(row.group).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  }

  // The created group should appear once with count >= 1.
  const groupRows = byGroup.filter((r: any) => r.group === group.name);
  expect(groupRows).toHaveLength(1);
  expect(groupRows[0].count).toBeGreaterThanOrEqual(1);

  await memberHelper.cleanupById(member.id);
  await memberGroupHelper.cleanupById(group.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:one -- --testPathPattern='member-reporting/__tests__/report-member-count'`
Expected: FAIL — currently produces a uuid row with count 1 alongside the name row with count 0.

- [ ] **Step 3: Fix the source**

Edit `src/umbraco-api/tools/member-reporting/get/report-member-count.ts`. The aggregation should:

1. List all member groups → build a `Map<id, name>`.
2. Walk every member's groups (which are ids) → look up names → tally `Map<name, count>`.
3. Seed any group with no members at zero by iterating the id→name map.
4. Emit `Array.from(byGroup.entries()).map(([group, count]) => ({ group, count }))`.

Pseudocode (apply to the existing handler — the file already does some of this; the bug is the missing id→name resolution before tallying):

```ts
// Build id → name map
const groupsResult = await chainCms("get-all-member-groups", { cursor: undefined });
if (!groupsResult.ok) return groupsResult.errorResult;
const idToName = new Map<string, string>(
  (groupsResult.data.items ?? []).map((g: any) => [g.id, g.name ?? "Unknown"]),
);

// Aggregate by name
const byGroupCount = new Map<string, number>();
for (const name of idToName.values()) byGroupCount.set(name, 0); // seed zeros

for (const member of allMembers) {
  for (const groupId of member.groups ?? []) {
    const name = idToName.get(groupId);
    if (name === undefined) continue; // unknown id — skip rather than fall through to a uuid row
    byGroupCount.set(name, (byGroupCount.get(name) ?? 0) + 1);
  }
}

const byGroup = Array.from(byGroupCount.entries()).map(([group, count]) => ({ group, count }));
```

Replace the existing duplicate-emitting walk with this approach. Drop any code path that falls back to emitting `{group: <uuid>, count: ...}` when a group can't be resolved.

- [ ] **Step 4: Run the test**

Run: `npm run test:one -- --testPathPattern='member-reporting/__tests__/report-member-count'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/member-reporting/get/report-member-count.ts \
        src/umbraco-api/tools/member-reporting/__tests__/report-member-count.test.ts
git commit -m "fix(audit): report-member-count aggregates byGroup by name

Was emitting both {group: <uuid>, count: N} (from member.groups walk)
and {group: <NAME>, count: 0} (from list-member-groups seed) for the
same logical group. Resolve uuids to names up-front so each group is
one row.

Refs: docs/audits/mcp-live-validation/failures/report-member-count-bygroup.md"
```

---

## Task 6: create-variant + copy-variant — pre-flight variesByCulture check

**Files:**
- Create: `src/umbraco-api/tools/translation/helpers/check-varies-by-culture.ts`
- Modify: `src/umbraco-api/tools/translation/post/create-variant.ts`
- Modify: `src/umbraco-api/tools/translation/post/copy-variant.ts`
- Modify: `src/umbraco-api/tools/translation/__tests__/create-variant.test.ts`
- Modify: `src/umbraco-api/tools/translation/__tests__/copy-variant.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `create-variant.test.ts`:

```ts
it("returns a clear error when the document type is invariant", async () => {
  // Content doctype is invariant in the demo
  const page = await contentTestHelper.createPage({
    documentTypeId: invariantContentTypeId,  // existing fixture from setup
    name: `invariant-variant-${Date.now()}`,
  });

  const result = await callTool(
    createVariant,
    { id: page.id, culture: "da-DK" },
    {},
  );

  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({
    status: 400,
    title: expect.stringMatching(/invariant|culture/i),
  });

  await contentTestHelper.cleanupById(page.id);
});
```

Append the same shape to `copy-variant.test.ts` (with appropriate sourceCulture/targetCulture).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:one -- --testPathPattern='translation/__tests__/(create|copy)-variant'`
Expected: BOTH FAIL — current tools return success with 0 fields copied / no variant created.

- [ ] **Step 3: Build the shared helper**

Create `src/umbraco-api/tools/translation/helpers/check-varies-by-culture.ts`:

```ts
import { chainCms } from "../../../cms-chain.js";
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";

/**
 * Returns null if the document type for the given document supports culture
 * variants, or an error result envelope if it doesn't.
 *
 * Use as a pre-flight before create-variant / copy-variant. Without this check,
 * Umbraco silently drops the new variant entry on persist, and the editor MCP
 * tool reports a misleading false success.
 */
export async function checkVariesByCulture(
  documentId: string,
): Promise<null | ReturnType<typeof createToolResultError>> {
  const docResult = await chainCms("get-document-by-id", { id: documentId });
  if (!docResult.ok) return docResult.errorResult;

  const docTypeId = docResult.data.documentType.id;
  const docTypeResult = await chainCms("get-document-type-by-id", { id: docTypeId });
  if (!docTypeResult.ok) return docTypeResult.errorResult;

  const variesByCulture =
    (docTypeResult.data as { variesByCulture?: boolean }).variesByCulture === true;

  if (!variesByCulture) {
    return createToolResultError({
      status: 400,
      title: "Document type is invariant",
      detail:
        `Document type "${docTypeResult.data.alias ?? docTypeResult.data.name ?? "(unknown)"}" ` +
        `does not allow culture variants. Enable 'Allow segmentation/variation by culture' ` +
        `on the document type in the Umbraco backoffice (Settings → Document Types) before ` +
        `creating or copying variants.`,
    });
  }

  return null;
}
```

- [ ] **Step 4: Wire into create-variant**

Edit `src/umbraco-api/tools/translation/post/create-variant.ts`. Inside the handler, before any other work:

```ts
import { checkVariesByCulture } from "../helpers/check-varies-by-culture.js";

// ... existing imports ...

handler: async ({ id, culture, values }) => {
  const variesError = await checkVariesByCulture(id);
  if (variesError) return variesError;

  // ... existing get-document-by-id, variantExists check, update-document call ...
}
```

(The existing `get-document-by-id` call lower in the handler is still needed for variant deduplication. Leave it.)

- [ ] **Step 5: Wire into copy-variant**

Same pattern for `src/umbraco-api/tools/translation/post/copy-variant.ts`. Add the check before any chained calls.

- [ ] **Step 6: Run the tests**

Run: `npm run test:one -- --testPathPattern='translation/__tests__/(create|copy)-variant'`
Expected: BOTH PASS — and the existing happy-path tests still pass too (they use a doctype with variesByCulture=true via the test fixture).

- [ ] **Step 7: Commit**

```bash
git add src/umbraco-api/tools/translation/helpers/check-varies-by-culture.ts \
        src/umbraco-api/tools/translation/post/create-variant.ts \
        src/umbraco-api/tools/translation/post/copy-variant.ts \
        src/umbraco-api/tools/translation/__tests__/create-variant.test.ts \
        src/umbraco-api/tools/translation/__tests__/copy-variant.test.ts
git commit -m "fix(audit): variant tools pre-flight variesByCulture

create-variant and copy-variant were reporting success on invariant
doctypes. Umbraco silently drops the variant entry; the tool's
update-document call returns ok and the message claims success. Add
a doctype pre-flight check that returns a clear 400 instead.

Refs: docs/audits/mcp-live-validation/failures/create-variant.md"
```

---

## Task 7: add-block tools — resolve property from doctype, not page values

**Files:**
- Modify: `src/umbraco-api/tools/content/post/add-blocklist-block.ts`
- Modify: `src/umbraco-api/tools/content/post/add-blockgrid-block.ts`
- Modify: `src/umbraco-api/tools/content/post/add-rte-block.ts`
- Modify: `src/umbraco-api/tools/content/__tests__/add-blocklist-block.test.ts`
- Modify: `src/umbraco-api/tools/content/__tests__/add-blockgrid-block.test.ts`
- Modify: `src/umbraco-api/tools/content/__tests__/add-rte-block.test.ts`

- [ ] **Step 1: Write the failing test (BlockList)**

Append to `add-blocklist-block.test.ts`:

```ts
it("adds the first block to a freshly created page (empty BlockList property)", async () => {
  setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept" }));

  // Use a doctype known to have a BlockList property (test fixture)
  const page = await contentTestHelper.createPage({
    documentTypeId: blockListContentTypeId,
    name: `empty-blocklist-${Date.now()}`,
  });

  // Page values do NOT yet contain the BlockList property — this is the bug case
  const result = await callTool(
    addBlocklistBlock,
    {
      id: page.id,
      propertyAlias: "contentRows",
      contentTypeKey: richTextRowElementTypeKey,
      values: [
        {
          alias: "content",
          value: { markup: "<p>first block</p>", blocks: { layout: {}, contentData: [], settingsData: [], expose: [] } },
        },
      ],
    },
    {},
  );

  expect(result.isError).toBeFalsy();
  expect(result.structuredContent.contentKey).toBeDefined();

  // Post-state: inspect-blocks should now find the property and the new block
  const inspect = await contentTestHelper.inspectBlocks(page.id);
  expect(inspect.blockProperties).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        propertyAlias: "contentRows",
        blocks: expect.arrayContaining([
          expect.objectContaining({ contentTypeKey: richTextRowElementTypeKey }),
        ]),
      }),
    ]),
  );

  await contentTestHelper.cleanupById(page.id);
});
```

(`blockListContentTypeId` and `richTextRowElementTypeKey` come from the test setup file — use whatever fixture key already exists for these. If the existing setup doesn't expose them, add them next to the other test fixtures.)

Add equivalent regression tests to `add-blockgrid-block.test.ts` and `add-rte-block.test.ts` with their respective doctype/element keys.

- [ ] **Step 2: Run tests to verify all three fail**

Run: `npm run test:one -- --testPathPattern='content/__tests__/add-(blocklist|blockgrid|rte)-block'`
Expected: 3 NEW tests FAIL with "Property '<alias>' not found on page".

- [ ] **Step 3: Fix add-blocklist-block**

Edit `src/umbraco-api/tools/content/post/add-blocklist-block.ts`. Replace the property lookup (around lines 67-74) with a doctype-driven resolution that allows missing values:

```ts
const docResult = await chainCms("get-document-by-id", { id });
if (!docResult.ok) return docResult.errorResult;
const doc = docResult.data;
const pageName = doc.variants?.[0]?.name ?? "Unknown";

// Resolve property definition from the doctype, not from page values.
const docTypeResult = await chainCms("get-document-type-by-id", { id: doc.documentType.id });
if (!docTypeResult.ok) return docTypeResult.errorResult;
const docTypeProperty = docTypeResult.data.properties.find((p: any) => p.alias === propertyAlias);
if (!docTypeProperty) {
  return createToolResultError({
    content: [
      {
        type: "text",
        text: `Property '${propertyAlias}' is not defined on document type '${docTypeResult.data.alias ?? docTypeResult.data.name}'.`,
      },
    ],
    isError: true,
  });
}

// Existing value (may be undefined for an uninitialized BlockList).
const existingProp = (doc.values ?? []).find(
  (v) => v.alias === propertyAlias && (v.culture ?? null) === (culture ?? null) && (v.segment ?? null) === (segment ?? null),
);
const propValue = existingProp?.value ?? {
  layout: { "Umbraco.BlockList": [] },
  contentData: [],
  settingsData: [],
  expose: [],
};

// Editor-alias check: if there's an existing value, it must already be a BlockList.
// If there's no existing value, accept on faith — we know from the doctype the
// property exists; we'll initialise it as a BlockList shape below.
if (existingProp && (!isBlockListOrGridValue(propValue) || existingProp.editorAlias !== "Umbraco.BlockList")) {
  return createToolResultError({
    content: [
      {
        type: "text",
        text: `Property '${propertyAlias}' on '${pageName}' is not a BlockList. Use inspect-blocks to confirm the editor type, or add-rte-block / add-blockgrid-block as appropriate.`,
      },
    ],
    isError: true,
  });
}
```

(The rest of the handler — building newContentEntry, layout assembly, update-document call — can stay as-is.)

- [ ] **Step 4: Apply the same fix to add-blockgrid-block**

Same pattern: doctype-driven resolution, accept missing existing value, initialise the BlockGrid shape (`{layout: {"Umbraco.BlockGrid": []}, contentData: [], settingsData: [], expose: []}`) when there's no existing value.

- [ ] **Step 5: Apply the same fix to add-rte-block**

Same pattern. Empty RTE shape: `{markup: "", blocks: {layout: {}, contentData: [], settingsData: [], expose: []}}`.

- [ ] **Step 6: Run all three add-block test files**

Run: `npm run test:one -- --testPathPattern='content/__tests__/add-(blocklist|blockgrid|rte)-block'`
Expected: all green, including the new regression tests AND the pre-existing happy-path tests.

- [ ] **Step 7: Commit**

```bash
git add src/umbraco-api/tools/content/post/add-blocklist-block.ts \
        src/umbraco-api/tools/content/post/add-blockgrid-block.ts \
        src/umbraco-api/tools/content/post/add-rte-block.ts \
        src/umbraco-api/tools/content/__tests__/add-blocklist-block.test.ts \
        src/umbraco-api/tools/content/__tests__/add-blockgrid-block.test.ts \
        src/umbraco-api/tools/content/__tests__/add-rte-block.test.ts
git commit -m "fix(audit): add-block tools resolve property from doctype

The previous lookup against doc.values rejected pages whose BlockList
property had no value yet — i.e. every newly-created page that hadn't
already had a block added. Resolve the property from the doctype and
fall back to an empty container when no value exists.

Refs: docs/audits/mcp-live-validation/failures/add-blocklist-block-empty-property.md"
```

---

## Task 8: edit-block + delete-block — verify they work after Task 7 unblocks them

**Files:**
- Modify: `src/umbraco-api/tools/content/__tests__/edit-block.test.ts`
- Modify: `src/umbraco-api/tools/content/__tests__/delete-blocklist-block.test.ts` (or whatever the delete-block test file is — confirm at run time)

These two tools were deferred during the audit because we couldn't seed a fixture block (Task 7's bug). Once Task 7 lands, write regression tests that exercise the full lifecycle: create page → add-block → edit-block → delete-block → verify post-state empty.

- [ ] **Step 1: Write the lifecycle test in `edit-block.test.ts`**

```ts
it("edits a block on a page that started empty", async () => {
  setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept" }));

  const page = await contentTestHelper.createPage({
    documentTypeId: blockListContentTypeId,
    name: `lifecycle-${Date.now()}`,
  });

  const added = await callTool(
    addBlocklistBlock,
    {
      id: page.id,
      propertyAlias: "contentRows",
      contentTypeKey: richTextRowElementTypeKey,
      values: [
        { alias: "content", value: { markup: "<p>v1</p>", blocks: { layout: {}, contentData: [], settingsData: [], expose: [] } } },
      ],
    },
    {},
  );
  const contentKey = added.structuredContent.contentKey;

  const result = await callTool(
    editBlock,
    {
      id: page.id,
      propertyAlias: "contentRows",
      contentKey,
      values: [
        { alias: "content", value: { markup: "<p>v2 edited</p>", blocks: { layout: {}, contentData: [], settingsData: [], expose: [] } } },
      ],
    },
    {},
  );
  expect(result.isError).toBeFalsy();

  const inspect = await contentTestHelper.inspectBlocks(page.id);
  const block = inspect.blockProperties[0].blocks.find((b: any) => b.contentKey === contentKey);
  expect(block.properties[0].value.markup).toContain("v2 edited");

  await contentTestHelper.cleanupById(page.id);
});
```

- [ ] **Step 2: Write the lifecycle test in the delete-block test file**

```ts
it("deletes a block on a page that started empty", async () => {
  setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept" }));

  const page = await contentTestHelper.createPage({
    documentTypeId: blockListContentTypeId,
    name: `delete-block-lifecycle-${Date.now()}`,
  });

  const added = await callTool(
    addBlocklistBlock,
    {
      id: page.id,
      propertyAlias: "contentRows",
      contentTypeKey: richTextRowElementTypeKey,
      values: [
        { alias: "content", value: { markup: "<p>x</p>", blocks: { layout: {}, contentData: [], settingsData: [], expose: [] } } },
      ],
    },
    {},
  );
  const contentKey = added.structuredContent.contentKey;

  const result = await callTool(
    deleteBlock,
    { id: page.id, propertyAlias: "contentRows", contentKey },
    {},
  );
  expect(result.isError).toBeFalsy();

  const inspect = await contentTestHelper.inspectBlocks(page.id);
  const property = inspect.blockProperties.find((p: any) => p.propertyAlias === "contentRows");
  expect(property?.blocks ?? []).toHaveLength(0);

  await contentTestHelper.cleanupById(page.id);
});
```

- [ ] **Step 3: Run both tests**

Run: `npm run test:one -- --testPathPattern='content/__tests__/(edit-block|delete-blocklist-block)'`
Expected: PASS (no source change needed — the bug was upstream of these tools, in add-block).

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/content/__tests__/edit-block.test.ts \
        src/umbraco-api/tools/content/__tests__/delete-blocklist-block.test.ts
git commit -m "test(audit): edit-block + delete-block lifecycle on empty page

These tools were deferred during the audit campaign because the
add-block tools couldn't seed a fixture block. With Task 7 unblocking
add-block, lock in regression coverage for the create→edit→delete
lifecycle starting from an empty page.

Refs: docs/audits/mcp-live-validation/results.md"
```

---

## Task 9: restore-page — fix UmbracoFetch initialization gap

**Investigation first.** This task has two viable fix paths and the right one depends on whether the upstream `restore-document-from-recycle-bin` tool in `@umbraco-cms/mcp-dev` still hardcodes `target: null` (the reason the editor MCP took the bypass route in the first place).

**Files (fix path A):**
- Modify: `src/umbraco-api/tools/content/put/restore-page.ts`

**Files (fix path B):**
- Modify: `src/index.ts`
- Modify: `src/umbraco-api/tools/content/put/restore-page.ts` (no behaviour change, just remove the workaround comment if init now works)

**Files (always):**
- Modify: `src/umbraco-api/tools/content/__tests__/restore-page.test.ts`

- [ ] **Step 1: Investigate the upstream**

Run:

```bash
grep -rn "restore-document-from-recycle-bin\|target.*null" node_modules/@umbraco-cms/mcp-dev 2>/dev/null | head -10
```

Read whatever's there. Determine:
- Does the upstream tool now accept `target` from the caller? → Fix path A (prefer)
- Does it still hardcode `target: null`? → Fix path B (initialize UmbracoFetch in stdio entry)

- [ ] **Step 2: Write the failing regression test**

```ts
it("restores a deleted page to its original parent", async () => {
  setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept" }));

  const page = await contentTestHelper.createPage({
    documentTypeId: invariantContentTypeId,
    name: `restore-target-${Date.now()}`,
    parentId: testFixtures.homeId,
  });

  await contentTestHelper.deletePage(page.id);

  const result = await callTool(
    restorePage,
    { id: page.id, parentId: testFixtures.homeId },
    {},
  );
  expect(result.isError).toBeFalsy();

  const children = await contentTestHelper.listChildren(testFixtures.homeId);
  expect(children.items.some((c: any) => c.id === page.id)).toBe(true);

  await contentTestHelper.cleanupById(page.id);
});
```

Run: `npm run test:one -- --testPathPattern='content/__tests__/restore-page'`
Expected: FAIL with "UmbracoFetch not initialized".

- [ ] **Step 3a: Fix path A — switch back to chainCms (preferred if upstream is fixed)**

Edit `src/umbraco-api/tools/content/put/restore-page.ts`. Replace the `UmbracoManagementClient` block with a chainCms call:

```ts
const restoreResult = await chainCms("restore-document-from-recycle-bin", {
  id,
  target: parentId ? { id: parentId } : null,
});
if (!restoreResult.ok) return restoreResult.errorResult;
```

Drop the `UmbracoManagementClient` import and the workaround comment. Run the test → expect PASS. Skip Step 3b.

- [ ] **Step 3b: Fix path B — initialize UmbracoFetch in stdio entry (only if upstream still hardcodes target null)**

Edit `src/index.ts`. After `import "dotenv/config";` and before any tool registration, initialize the management-API client:

```ts
import { initializeUmbracoFetch } from "@umbraco-cms/mcp-server-sdk";

// Initialize the management-API HTTP client for any tool that calls
// UmbracoManagementClient directly (restore-page, preview-url's optional
// management-API path). Most tools delegate via chainCms which uses the
// chained CMS subprocess's own client; these direct callsites need the
// editor MCP's own client wired up too.
await initializeUmbracoFetch({
  baseUrl: process.env.UMBRACO_BASE_URL,
  clientId: process.env.UMBRACO_CLIENT_ID,
  clientSecret: process.env.UMBRACO_CLIENT_SECRET,
});
```

(The exact function name + signature should be confirmed against the SDK exports during implementation.)

Run the test → expect PASS.

- [ ] **Step 4: Run the test**

Run: `npm run test:one -- --testPathPattern='content/__tests__/restore-page'`
Expected: PASS.

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: green.

- [ ] **Step 6: Commit**

For path A:

```bash
git add src/umbraco-api/tools/content/put/restore-page.ts \
        src/umbraco-api/tools/content/__tests__/restore-page.test.ts
git commit -m "fix(audit): restore-page chains via cms-mcp again

Upstream restore-document-from-recycle-bin now accepts the target
parameter, so the workaround using UmbracoManagementClient (which
isn't initialized in stdio mode and crashed live) can go away.

Refs: docs/audits/mcp-live-validation/failures/restore-page-fetch-init.md"
```

For path B:

```bash
git add src/index.ts \
        src/umbraco-api/tools/content/put/restore-page.ts \
        src/umbraco-api/tools/content/__tests__/restore-page.test.ts
git commit -m "fix(audit): initialize UmbracoFetch in stdio entry

Tools like restore-page that bypass chainCms to call the management
API directly need the editor MCP's own UmbracoFetch initialized.
Previously only the chained CMS subprocess set it up, so direct
callsites crashed in stdio mode.

Refs: docs/audits/mcp-live-validation/failures/restore-page-fetch-init.md"
```

---

## Task 10: audit-page-content — extract title field + recurse into block content

**Files:**
- Modify: `src/umbraco-api/tools/helpers/tree-walker.ts`
- Modify: `src/umbraco-api/tools/content-health/__tests__/audit-page-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("extracts text from BlockList rich-text-row blocks and from the title field", async () => {
  const page = await contentTestHelper.createPage({
    documentTypeId: contentDoctypeId,
    name: `body-extract-${Date.now()}`,
  });
  await contentTestHelper.editPage(page.id, [
    { alias: "title", value: "Hello world" },
    { alias: "subtitle", value: "Subtitle here" },
  ]);
  // Seed a richTextRow block with body content
  await callTool(
    addBlocklistBlock,
    {
      id: page.id,
      propertyAlias: "contentRows",
      contentTypeKey: richTextRowElementTypeKey,
      values: [
        {
          alias: "content",
          value: {
            markup: "<p>Inside-block paragraph that should be in the bodyContent.</p>",
            blocks: { layout: {}, contentData: [], settingsData: [], expose: [] },
          },
        },
      ],
    },
    {},
  );

  const result = await callTool(auditPageContent, { id: page.id }, {});

  expect(result.structuredContent.bodyContent).toContain("Hello world");
  expect(result.structuredContent.bodyContent).toContain("Inside-block paragraph");
  expect(result.structuredContent.bodyWordCount).toBeGreaterThan(5);

  await contentTestHelper.cleanupById(page.id);
});
```

(Depends on Task 7 — the add-block fix.)

Run: `npm run test:one -- --testPathPattern='content-health/__tests__/audit-page-content'`
Expected: FAIL — bodyContent is just the subtitle.

- [ ] **Step 2: Extend `extractTextContent` in tree-walker.ts**

Read the existing `extractTextContent` function in `src/umbraco-api/tools/helpers/tree-walker.ts`. Extend it:

1. Include `title`/`metaName` field values when present (currently excluded — confirm by reading the source).
2. For `Umbraco.BlockList` and `Umbraco.BlockGrid` values, walk `contentData[].values[]` and recursively extract text from string-typed and RTE-typed values.
3. For `Umbraco.RichText` values (which have shape `{markup: string, blocks: {...}}`), extract from `markup` (strip HTML via the existing `stripHtml`) AND recurse into `blocks.contentData`.
4. Concatenate with spaces, trim.

The exact diff depends on the current shape of the function — do this part during implementation, not in the plan.

- [ ] **Step 3: Run the test**

Run: `npm run test:one -- --testPathPattern='content-health/__tests__/audit-page-content'`
Expected: PASS.

- [ ] **Step 4: Run the full suite (other tools use this helper too)**

Run: `npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/helpers/tree-walker.ts \
        src/umbraco-api/tools/content-health/__tests__/audit-page-content.test.ts
git commit -m "fix(audit): extractTextContent walks blocks + includes title

Was only catching plain string property values, missing the title
field and any text inside BlockList / BlockGrid / RTE-with-blocks
values. Made the body-content audit useless on pages where most
content lives inside blocks.

Refs: docs/audits/mcp-live-validation/failures/audit-page-content.md"
```

---

## Task 11: bulk-move (and friends) — parse nested error JSON before surfacing

**Files:**
- Modify: `src/umbraco-api/tools/helpers/bulk-handler.ts`
- Modify: `src/umbraco-api/tools/bulk-operations/__tests__/bulk-move.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("surfaces upstream errors as a parsed object, not as escaped JSON", async () => {
  setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept" }));

  // A page that the target parent doesn't allow as a child (Blog under
  // Content rule mismatch). Use the existing testFixtures setup for an
  // example; if none, document a fresh fixture in setup.ts.
  const page = await contentTestHelper.createPage({
    documentTypeId: contentDoctypeId,
    name: `bulk-move-error-${Date.now()}`,
  });

  const result = await callTool(
    bulkMove,
    {
      ids: [page.id],
      targetParentId: testFixtures.parentThatRejectsContent,
    },
    {},
  );

  const failed = result.structuredContent.results.find((r: any) => r.success === false);
  expect(failed).toBeDefined();
  expect(typeof failed.error).toBe("object");
  expect(failed.error.title).toBeDefined();
  expect(failed.error.detail).toBeDefined();

  await contentTestHelper.cleanupById(page.id);
});
```

(Depends on adding a `parentThatRejectsContent` fixture in setup.ts — pick a parent the demo doctype rules disallow as Content's child. Blog used to work in the audit run.)

Run: `npm run test:one -- --testPathPattern='bulk-operations/__tests__/bulk-move'`
Expected: FAIL — `failed.error` is currently a string of escaped JSON.

- [ ] **Step 2: Update bulk-handler to parse before surfacing**

Edit `src/umbraco-api/tools/helpers/bulk-handler.ts`'s `executeBulkSequentially` (or wherever per-item errors are caught). Where the catch path currently does something like `error: String(err)`, change to parse the inner `text` payload if it's JSON:

```ts
function parseBulkError(err: any): unknown {
  // Tool errors arrive as { content: [{ type: "text", text: "<json>" }], ... }.
  // Surface the parsed problem-details object so consumers don't have to
  // double-parse escaped JSON.
  const text = err?.content?.[0]?.text;
  if (typeof text === "string") {
    try {
      const inner = JSON.parse(text);
      // The inner often has the same { content, structuredContent } shape
      // again. Drill one level deeper to the structuredContent if present.
      if (inner?.structuredContent) return inner.structuredContent;
      return inner;
    } catch {
      // not JSON — fall through
    }
  }
  return err?.message ?? String(err);
}
```

Then use `parseBulkError(err)` wherever the bulk handler emits the per-item error field.

- [ ] **Step 3: Run the test**

Run: `npm run test:one -- --testPathPattern='bulk-operations/__tests__/bulk-move'`
Expected: PASS.

- [ ] **Step 4: Run the full bulk suite to confirm no regressions**

Run: `npm run test:one -- --testPathPattern='bulk-operations/__tests__'`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/helpers/bulk-handler.ts \
        src/umbraco-api/tools/bulk-operations/__tests__/bulk-move.test.ts
git commit -m "fix(audit): bulk handler parses per-item error JSON

Bulk results were surfacing per-item errors as escaped JSON strings
nested inside an outer JSON object — an LLM had to JSON.parse twice
to find the problem-details. Parse once in the handler and emit
the structured object.

Refs: docs/audits/mcp-live-validation/results.md (bulk-move ⚠️)"
```

---

## Task 12: Final sweep — full test run + audit-folder housekeeping

**Files:**
- Modify: `docs/audits/mcp-live-validation/results.md` (mark each finding as fixed with the commit SHA)
- (No source changes)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test:all`
Expected: green (all integration tests + all eval tests).

- [ ] **Step 2: Run a quick live re-audit on each fixed tool**

(This is optional but valuable — it's the same shape as the original audit, just for the tools we just touched.) Start Umbraco if needed (`npm run start:umbraco`), then through the editor MCP:

- delete-redirect with a fake UUID → expect 404 error envelope
- update-member with name only on a member-with-groups → get-member.groups still populated
- report-members-by-group → finds the member
- report-member-count → no UUIDs in byGroup
- create-variant on invariant doctype → 400 error
- copy-variant on invariant doctype → 400 error
- add-blocklist-block on a fresh page → success + inspect-blocks shows the block
- restore-page on a deleted fixture → restored to parent, list-children verifies
- audit-page-content on a page with block content → bodyContent contains it
- bulk-move with rejecting target → results[].error is an object, not a string

- [ ] **Step 3: Update the audit worksheet**

Edit `docs/audits/mcp-live-validation/results.md`. For each finding, add a "Fixed" line near the top with the commit SHA(s). Drop the "Next steps" placeholder for these — keep only the Phase 12 (tree-walking reports) follow-up.

- [ ] **Step 4: Remove `UMBRACO_AUTO_CONFIRM=true` from .env**

```bash
sed -i '' 's/^UMBRACO_AUTO_CONFIRM=true$/# UMBRACO_AUTO_CONFIRM=true (set during audit campaigns only)/' .env
```

The bypass code stays — only the env trigger goes away.

- [ ] **Step 5: Commit and open the PR**

```bash
git add docs/audits/mcp-live-validation/results.md .env
git commit -m "docs(audit): close out fix campaign

- Mark all fixed findings against their commits
- Restore default destructive-confirm prompts in dev (.env)

Refs: docs/audits/mcp-live-validation/"
```

Then open the PR per project conventions (gh pr create), targeting `dev` per `feedback_base_branching.md`.

---

## Self-Review

**Spec coverage** — every finding from `docs/audits/mcp-live-validation/results.md` Run Summary maps to a task:

| Finding | Task |
|---------|------|
| ❌ restore-page UmbracoFetch | 9 |
| ❌ update-member strips groups | 3 |
| ❌ add-blocklist-block / add-blockgrid-block / add-rte-block empty-property | 7 |
| ❌ delete-redirect false success | 2 |
| ❌ report-members-by-group filters by id | 4 |
| ❌ create-variant false success | 6 |
| ⚠️ copy-variant same as create-variant | 6 |
| ⚠️ report-member-count.byGroup duplicates | 5 |
| ⚠️ audit-page-content body extraction | 10 |
| ⚠️ bulk-move error formatting | 11 |
| campaign-blocker-elicitation (the bypass itself) | 1 |
| edit-block + delete-block (deferred during audit) | 8 |
| shared-empty-upstream-fields | (out of scope, documented in plan header) |
| preview-url-stale-port | (out of scope, documented in plan header) |

**Placeholder scan** — Tasks 9, 10, 11 each contain one "do this part during implementation, not in the plan" hedge that's specifically about reading the existing source before writing the fix. Those hedges are intentional (the code is too dynamic to pre-write) — but each is paired with a concrete failing test, expected outcome, and exit criterion, so the engineer isn't navigating without instruments.

**Type consistency** — `callTool` signature, the `(tool, args, extra)` shape, and the `result.structuredContent` access pattern is consistent across all tasks. `setupEditorElicitation(jest.fn().mockResolvedValue(...))` is used the same way in every write-tool test. Helper names (`memberHelper`, `memberGroupHelper`, `contentTestHelper`) match the existing per-collection patterns.
