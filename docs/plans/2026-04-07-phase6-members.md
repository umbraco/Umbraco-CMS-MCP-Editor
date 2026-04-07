# Phase 6: Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **IMPORTANT:** Use `umbraco-mcp-skills` agents and skills for all tool, test, and eval creation.

**Goal:** Add member management, member group management, and member reporting to the editor MCP — 12 new tools across 3 collections.

**Architecture:** Same delegation-to-CMS pattern as previous phases. Member delete is permanent (no recycle bin) with extra-strong elicitation warnings. Reporting tools return chart-ready data with hybrid flags for LLM reasoning.

**Tech Stack:** TypeScript, Zod schemas, @umbraco-cms/mcp-server-sdk, @umbraco-cms/mcp-dev (chained CMS tools)

---

### Task 1: Add `members` mode to registry

**Files:**
- Modify: `src/config/mode-registry.ts`

- [ ] **Step 1: Add mode**

Add to the `toolModes` array:

```typescript
{
  name: 'members',
  displayName: 'Members',
  description: 'Manage members, member groups, and member reporting',
  collections: ['member', 'member-group', 'member-reporting']
},
```

- [ ] **Step 2: Compile and commit**

Run: `npm run compile`

```bash
git add src/config/mode-registry.ts
git commit -m "feat: add members mode to registry"
```

---

### Task 2: Create `member` collection — 6 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/member/index.ts`
- Create: `src/umbraco-api/tools/member/get/search-members.ts`
- Create: `src/umbraco-api/tools/member/get/get-member.ts`
- Create: `src/umbraco-api/tools/member/get/list-member-types.ts`
- Create: `src/umbraco-api/tools/member/post/create-member.ts`
- Create: `src/umbraco-api/tools/member/put/update-member.ts`
- Create: `src/umbraco-api/tools/member/delete/delete-member.ts`

- [ ] **Step 1: Create `search-members` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `search-members`
- Input: `query` (string, name or email), `take` (default 20), `skip` (default 0)
- Output: `{ items: [{ id, name, email, memberType, isApproved, isLockedOut }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "find-member", { filter: query, take, skip })`
- Map items extracting id, name, email, memberType alias/name, isApproved, isLockedOut
- Slices: `["search"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Search for members by name or email address. Returns matching members with their approval and lockout status. Use get-member for full profile details."`

- [ ] **Step 2: Create `get-member` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-member`
- Input: `id` (uuid)
- Output: `{ id, name, email, username, memberType, isApproved, isLockedOut, isTwoFactorEnabled, groups, values, lastLoginDate, lastPasswordChangeDate }`
- Delegate to: `mcpClientManager.callTool("cms", "get-member", { id })`
- Extract and shape the full member profile
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Get the full profile of a member including their groups, properties, approval status, and login history."`

- [ ] **Step 3: Create `list-member-types` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-member-types`
- Input: `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, alias, name }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-member-type-root", { take, skip })`
- Slices: `["list"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List available member types. Use this before create-member to find a valid member type ID."`

- [ ] **Step 4: Create `create-member` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `create-member`
- Input: `email` (string), `username` (string), `name` (string), `password` (string), `memberTypeId` (uuid), `groups` (string array, optional), `values` (array of `{ alias, value }`, optional)
- Output: `{ message, id, name, email }`
- Import `confirmAction` from SDK
- Elicitation: `confirmAction(extra, \`Create member "${name}" (${email})?\`, { title: "Confirm create member" })`
- Delegate to: `mcpClientManager.callTool("cms", "create-member", { email, username, name, password, memberType: { id: memberTypeId }, groups, values })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Create a new member account. Call list-member-types to find a valid member type ID and list-member-groups to see available groups. You will be asked to confirm."`

- [ ] **Step 5: Create `update-member` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `update-member`
- Input: `id` (uuid), `name` (string, optional), `email` (string, optional), `isApproved` (boolean, optional), `isLockedOut` (boolean, optional), `groups` (string array, optional), `values` (array of `{ alias, value }`, optional)
- Output: `{ message, id, name, email }`
- Fetch member details first for confirmation name
- Elicitation: `confirmAction(extra, \`Update member "${memberName}" (${memberEmail})?\`, { title: "Confirm update member" })`
- Delegate to: `mcpClientManager.callTool("cms", "update-member", { id, name, email, isApproved, isLockedOut, groups, values })`
- Slices: `["update"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Update a member's profile, approval status, groups, or custom properties. Call get-member first to see current values. You will be asked to confirm."`

- [ ] **Step 6: Create `delete-member` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `delete-member`
- Input: `id` (uuid)
- Output: `{ message, id, name, email }`
- Fetch member details for confirmation
- Elicitation: `confirmAction(extra, \`Permanently delete member "${name}" (${email})? This cannot be undone. The member and all their data will be removed.\`, { title: "Confirm delete member", defaultValue: false })`
- Delegate to: `mcpClientManager.callTool("cms", "delete-member", { id })`
- Slices: `["delete"]`, annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: `"Permanently delete a member. This cannot be undone — there is no recycle bin for members. You will be asked to confirm."`

- [ ] **Step 7: Create collection index**

Create `src/umbraco-api/tools/member/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchMembersTool from "./get/search-members.js";
import getMemberTool from "./get/get-member.js";
import listMemberTypesTool from "./get/list-member-types.js";
import createMemberTool from "./post/create-member.js";
import updateMemberTool from "./put/update-member.js";
import deleteMemberTool from "./delete/delete-member.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "member",
    displayName: "Members",
    description: "Search, view, create, update, and delete members",
  },
  tools: () => [searchMembersTool, getMemberTool, listMemberTypesTool, createMemberTool, updateMemberTool, deleteMemberTool],
};

export default collection;
```

- [ ] **Step 8: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/member/
git commit -m "feat: add member collection with search, get, list-types, create, update, delete tools"
```

---

### Task 3: Create `member-group` collection — 3 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/member-group/index.ts`
- Create: `src/umbraco-api/tools/member-group/get/list-member-groups.ts`
- Create: `src/umbraco-api/tools/member-group/post/create-member-group.ts`
- Create: `src/umbraco-api/tools/member-group/delete/delete-member-group.ts`

- [ ] **Step 1: Create `list-member-groups` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-member-groups`
- Input: `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-all-member-groups", { take, skip })`
- Slices: `["list"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List all member groups. Use group names when creating or updating members to assign them to groups."`

- [ ] **Step 2: Create `create-member-group` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `create-member-group`
- Input: `name` (string)
- Output: `{ message, id, name }`
- Elicitation: `confirmAction(extra, \`Create member group "${name}"?\`, { title: "Confirm create member group" })`
- Delegate to: `mcpClientManager.callTool("cms", "create-member-group", { name })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Create a new member group. You will be asked to confirm."`

- [ ] **Step 3: Create `delete-member-group` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `delete-member-group`
- Input: `id` (uuid)
- Output: `{ message, id, name }`
- Fetch group name via `mcpClientManager.callTool("cms", "get-member-group", { id })` for confirmation
- Elicitation: `confirmAction(extra, \`Delete member group "${name}"? Members in this group will lose this group assignment.\`, { title: "Confirm delete member group", defaultValue: false })`
- Delegate to: `mcpClientManager.callTool("cms", "delete-member-group", { id })`
- Slices: `["delete"]`, annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: `"Delete a member group. Members in this group will lose the group assignment. You will be asked to confirm."`

- [ ] **Step 4: Create collection index**

Create `src/umbraco-api/tools/member-group/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listMemberGroupsTool from "./get/list-member-groups.js";
import createMemberGroupTool from "./post/create-member-group.js";
import deleteMemberGroupTool from "./delete/delete-member-group.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "member-group",
    displayName: "Member Groups",
    description: "Manage member groups for organising members",
  },
  tools: () => [listMemberGroupsTool, createMemberGroupTool, deleteMemberGroupTool],
};

export default collection;
```

- [ ] **Step 5: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/member-group/
git commit -m "feat: add member-group collection with list, create, delete tools"
```

---

### Task 4: Create `member-reporting` collection — 3 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/member-reporting/index.ts`
- Create: `src/umbraco-api/tools/member-reporting/get/report-member-count.ts`
- Create: `src/umbraco-api/tools/member-reporting/get/report-members-by-group.ts`
- Create: `src/umbraco-api/tools/member-reporting/get/report-member-activity.ts`

- [ ] **Step 1: Create `report-member-count` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-member-count`
- Input: (none required)
- Output: `{ totalMembers, byType: [{ memberType, count }], byGroup: [{ group, count }] }`
- Fetch all members via paginated `mcpClientManager.callTool("cms", "find-member", { take: 100, skip: 0 })` calls
- Fetch all groups via `mcpClientManager.callTool("cms", "get-all-member-groups", {})`
- Group members by type and count. Group members by group and count.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Get a breakdown of member counts by type and group. Data maps naturally to pie or bar charts."`

- [ ] **Step 2: Create `report-members-by-group` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-members-by-group`
- Input: `groupName` (string), `take` (default 50), `skip` (default 0)
- Output: `{ groupName, items: [{ id, name, email, isApproved, lastLoginDate }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "find-member", { memberGroupName: groupName, take, skip })` — or use `filter` param with group name if the API supports it
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List members belonging to a specific group. Use list-member-groups to find valid group names."`

- [ ] **Step 3: Create `report-member-activity` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-member-activity`
- Input: `inactiveDays` (number, optional, default 90), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, email, memberType, lastLoginDate, daysSinceLogin }], total, threshold, inactiveCount }`
- Fetch members via `find-member`. For each, compute days since last login. Filter to those exceeding threshold. Sort most inactive first. `daysSinceLogin` is null if no login date recorded.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find members who haven't logged in within a given number of days. Default threshold is 90 days. Useful for identifying inactive accounts."`

- [ ] **Step 4: Create collection index**

Create `src/umbraco-api/tools/member-reporting/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportMemberCountTool from "./get/report-member-count.js";
import reportMembersByGroupTool from "./get/report-members-by-group.js";
import reportMemberActivityTool from "./get/report-member-activity.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "member-reporting",
    displayName: "Member Reporting",
    description: "Member analytics and reporting",
  },
  tools: () => [reportMemberCountTool, reportMembersByGroupTool, reportMemberActivityTool],
};

export default collection;
```

- [ ] **Step 5: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/member-reporting/
git commit -m "feat: add member-reporting collection with count, by-group, activity tools"
```

---

### Task 5: Register collections and wire into entry points

**Files:**
- Modify: `src/collections.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update collections.ts and index.ts**

Add imports for `memberCollection`, `memberGroupCollection`, `memberReportingCollection` and register in both files.

- [ ] **Step 2: Compile, build, test**

Run: `npm run compile && npm run build`
Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit`
Expected: All 114 existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/collections.ts src/index.ts
git commit -m "feat: register member, member-group, member-reporting collections"
```

---

### Task 6: Review tools with mcp-tool-reviewer

- [ ] **Step 1: Run tool review on all 12 new tools**

Use the `mcp-tool-reviewer` agent:
- `src/umbraco-api/tools/member/` (6 tools)
- `src/umbraco-api/tools/member-group/` (3 tools)
- `src/umbraco-api/tools/member-reporting/` (3 tools)

- [ ] **Step 2: Apply review feedback and commit**

```bash
git add -A
git commit -m "fix: apply tool review feedback to Phase 6 member tools"
```

---

### Task 7: Integration tests for `member` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/member/__tests__/member.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `search-members`: search with a query, verify item shape (id, name, email, memberType, isApproved, isLockedOut)
- `get-member`: get a known member (find one from search), verify full profile shape
- `list-member-types`: list types, verify items have id, alias, name
- `create-member` + `update-member` + `delete-member` lifecycle: create test member, update name, delete permanently. Elicitation accept for all three.
- Elicitation rejection for create, update, delete
- Error: get-member with non-existent UUID
- CMS check via `search-members` or `list-member-types`

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=member/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/member/__tests__/
git commit -m "test: add member collection integration tests"
```

---

### Task 8: Integration tests for `member-group` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/member-group/__tests__/member-group.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `list-member-groups`: list all, verify item shape (id, name)
- `create-member-group` + `delete-member-group` lifecycle: create test group, delete it. Elicitation accept for both.
- Elicitation rejection for create and delete
- CMS check via `list-member-groups`

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=member-group/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/member-group/__tests__/
git commit -m "test: add member-group collection integration tests"
```

---

### Task 9: Integration tests for `member-reporting` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/member-reporting/__tests__/member-reporting.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `report-member-count`: verify totalMembers, byType array, byGroup array
- `report-members-by-group`: verify structure with a known group name (from list-member-groups, or skip if no groups)
- `report-member-activity`: verify items have daysSinceLogin, threshold, inactiveCount
- CMS check via `report-member-count`

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=member-reporting/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/member-reporting/__tests__/
git commit -m "test: add member-reporting collection integration tests"
```

---

### Task 10: Eval tests for member workflows

Use the `eval-test-creator` agent.

**Files:**
- Create: `tests/evals/member-workflows.test.ts`
- Modify: all existing eval files to update `allTools` arrays

- [ ] **Step 1: Create eval tests**

6 scenarios:

1. "Find member by name" — prompt: "Search for members with the name 'admin' or 'test'", tools: ["search-members", "get-member"], requiredTools: ["search-members"], successPattern: /member|search|found|admin|test/i

2. "View member profile" — prompt: "Use search-members to find a member, then use get-member to show their full profile", tools: allTools, requiredTools: ["get-member"], successPattern: /member|profile|email|group/i

3. "Create a member" — prompt: "Create a new test member with email test-eval@example.com. Use list-member-types first to find a valid member type.", tools: allTools, requiredTools: ["create-member"], successPattern: /member|created|confirm/i

4. "Member count breakdown" — prompt: "Use report-member-count to show a breakdown of members by type and group", tools: ["report-member-count", "list-member-groups"], requiredTools: ["report-member-count"], successPattern: /member|count|type|group/i

5. "Inactive members" — prompt: "Use report-member-activity with a 90 day threshold to find inactive members", tools: ["report-member-activity"], requiredTools: ["report-member-activity"], successPattern: /member|inactive|activity|login|day/i

6. "List member groups" — prompt: "What member groups exist on the site?", tools: ["list-member-groups"], requiredTools: ["list-member-groups"], successPattern: /group|member/i

- [ ] **Step 2: Update allTools in all eval files**

Add 12 new tool names to allTools in all existing eval files:
```typescript
// Members
"search-members", "get-member", "list-member-types", "create-member", "update-member", "delete-member",
// Member Groups
"list-member-groups", "create-member-group", "delete-member-group",
// Member Reporting
"report-member-count", "report-members-by-group", "report-member-activity",
```

- [ ] **Step 3: Run evals and commit**

```bash
npm run test:evals
git add tests/evals/
git commit -m "test: add member eval tests, update allTools arrays"
```

---

### Task 11: Update hosted e2e test tool list

**Files:**
- Modify: `tests/hosted-e2e/mcp-inspector.test.ts`
- Modify: `tests/hosted-e2e/elicitation.test.ts`

- [ ] **Step 1: Update ALL_TOOLS/WRITE_TOOLS/READ_TOOLS arrays**

Add 12 new tool names (73 tools total). Read tools: search-members, get-member, list-member-types, list-member-groups, report-member-count, report-members-by-group, report-member-activity. Write tools: create-member, update-member, delete-member, create-member-group, delete-member-group.

- [ ] **Step 2: Run hosted e2e tests**

Run: `HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/hosted-e2e/
git commit -m "test: update hosted e2e tests for 73-tool count"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run compile
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit
npm run test:evals
HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts
```

Expected:
- Integration tests: ~130+ passing
- Evals: ~63 passing
- Hosted e2e: 4 passing

- [ ] **Step 2: Verify tool count**

Confirm 73 tools registered.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 6 complete — 73 tools across 18 collections"
```
