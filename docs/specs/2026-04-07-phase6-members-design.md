# Phase 6: Members — Design Spec

## Overview

Add member management, member group management, and member reporting to the editor MCP. Three new collections, 12 new tools. Member delete is permanent (no recycle bin) so it has extra-strong safeguards.

## Collections

### `member` (6 tools)

Manage site members — search, view, create, update, delete, and list available types.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `search-members` | Find members by name or email | `find-member` | `search` | no |
| `get-member` | Full member profile details | `get-member` | `read` | no |
| `create-member` | Create a new member | `create-member` | `create` | yes, default checked |
| `update-member` | Update member profile fields | `update-member` | `update` | yes, default checked |
| `delete-member` | Permanently delete a member | `delete-member` | `delete` | yes, destructive, default unchecked |
| `list-member-types` | List available member types | `get-member-type-root` | `list` | no |

### `member-group` (3 tools)

Manage member groups for organising members.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `list-member-groups` | List all member groups | `get-all-member-groups` | `list` | no |
| `create-member-group` | Create a new group | `create-member-group` | `create` | yes, default checked |
| `delete-member-group` | Delete a group | `delete-member-group` | `delete` | yes, destructive, default unchecked |

### `member-reporting` (3 tools)

Member analytics and reporting — hybrid data for LLM reasoning and diagrams.

| Tool | Purpose | CMS delegation | Slices |
|------|---------|---------------|--------|
| `report-member-count` | Members by type/group breakdown | `find-member` + `get-all-member-groups` | `read` |
| `report-members-by-group` | List members in a specific group | `find-member` with group filter | `read` |
| `report-member-activity` | Members sorted by last login — find inactive | `find-member` with sorting | `read` |

## Tool Design Details

### Member tools

**`search-members`**
- Input: `query` (string, name or email), `take` (default 20), `skip` (default 0)
- Output: `{ items: [{ id, name, email, memberType, isApproved, isLockedOut }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "find-member", { filter: query, take, skip })`
- Description: "Search for members by name or email address. Returns matching members with their approval and lockout status. Use get-member for full profile details."

**`get-member`**
- Input: `id` (uuid)
- Output: `{ id, name, email, username, memberType, isApproved, isLockedOut, isTwoFactorEnabled, groups, values, lastLoginDate, lastPasswordChangeDate }`
- Delegate to: `mcpClientManager.callTool("cms", "get-member", { id })`
- Description: "Get the full profile of a member including their groups, properties, approval status, and login history."

**`create-member`**
- Input: `email` (string), `username` (string), `name` (string), `password` (string), `memberTypeId` (uuid), `groups` (string[], optional — group names), `values` (array of `{ alias, value }`, optional)
- Output: `{ message, id, name, email }`
- Elicitation: "Create member {name} ({email})?"
- Delegate to: `mcpClientManager.callTool("cms", "create-member", { email, username, name, password, memberType: { id: memberTypeId }, groups, values })`
- Description: "Create a new member account. Call list-member-types to find a valid member type ID and list-member-groups to see available groups. You will be asked to confirm."

**`update-member`**
- Input: `id` (uuid), `name` (string, optional), `email` (string, optional), `isApproved` (boolean, optional), `isLockedOut` (boolean, optional), `groups` (string[], optional), `values` (array of `{ alias, value }`, optional)
- Output: `{ message, id, name, email }`
- Fetch member name first for confirmation
- Elicitation: "Update member {name} ({email})?"
- Delegate to: `mcpClientManager.callTool("cms", "update-member", { id, ... })`
- Description: "Update a member's profile, approval status, groups, or custom properties. Call get-member first to see current values. You will be asked to confirm."

**`delete-member`**
- Input: `id` (uuid)
- Output: `{ message, id, name, email }`
- Fetch member details for confirmation
- Elicitation: "Permanently delete member {name} ({email})? This cannot be undone. The member and all their data will be removed." Default unchecked.
- Delegate to: `mcpClientManager.callTool("cms", "delete-member", { id })`
- Description: "Permanently delete a member. This cannot be undone — there is no recycle bin for members. You will be asked to confirm."

**`list-member-types`**
- Input: `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, alias, name }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-member-type-root", { take, skip })`
- Description: "List available member types. Use this before create-member to find a valid member type ID."

### Member group tools

**`list-member-groups`**
- Input: `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-all-member-groups", { take, skip })`
- Description: "List all member groups. Use group names when creating or updating members to assign them to groups."

**`create-member-group`**
- Input: `name` (string)
- Output: `{ message, id, name }`
- Elicitation: "Create member group {name}?"
- Delegate to: `mcpClientManager.callTool("cms", "create-member-group", { name })`
- Description: "Create a new member group. You will be asked to confirm."

**`delete-member-group`**
- Input: `id` (uuid)
- Output: `{ message, id, name }`
- Fetch group name for confirmation
- Elicitation: "Delete member group {name}? Members in this group will lose this group assignment." Default unchecked.
- Delegate to: `mcpClientManager.callTool("cms", "delete-member-group", { id })`
- Description: "Delete a member group. Members in this group will lose the group assignment. You will be asked to confirm."

### Member reporting tools

All read-only, no elicitation. Hybrid output for LLM reasoning and diagrams.

**`report-member-count`**
- Input: (none required)
- Output:
  ```
  {
    totalMembers: number,
    byType: [{ memberType, count }],
    byGroup: [{ group, count }],
  }
  ```
- Fetches all members via `find-member` (paginated) and all groups via `get-all-member-groups`. Groups by type and group. Chart-ready.
- Description: "Get a breakdown of member counts by type and group. Data maps naturally to pie or bar charts."

**`report-members-by-group`**
- Input: `groupName` (string), `take` (default 50), `skip` (default 0)
- Output: `{ groupName, items: [{ id, name, email, isApproved, lastLoginDate }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "find-member", { filter: groupName, memberGroupName: groupName, take, skip })` or equivalent filtering
- Description: "List members belonging to a specific group. Use list-member-groups to find valid group names."

**`report-member-activity`**
- Input: `inactiveDays` (number, optional, default 90), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, email, memberType,
      lastLoginDate: string | null,
      daysSinceLogin: number | null,
    }],
    total,
    threshold: number,
    inactiveCount: number,
  }
  ```
- Fetches members, computes days since last login, filters to those exceeding threshold. Sorted by most inactive first.
- Description: "Find members who haven't logged in within a given number of days. Default threshold is 90 days. Useful for identifying inactive accounts."

## Mode Registry

New mode:
- `members` — includes `member`, `member-group`, `member-reporting` collections

## Worker Configuration

No worker.ts changes needed. The permissive mock user already has `Umb.Section.Members` in allowedSections.

## Testing

### Integration tests (per collection, using integration-test-creator agent)
- `member/__tests__/` — search, get, create/update/delete lifecycle, list-member-types, elicitation accept/reject
- `member-group/__tests__/` — list, create/delete lifecycle, elicitation accept/reject
- `member-reporting/__tests__/` — report-member-count, report-members-by-group, report-member-activity

### Eval tests (using eval-test-creator agent)
- "Find member John Smith" — requires search-members
- "Show me John's full profile" — requires get-member
- "Create a new member for jane@example.com" — requires create-member
- "How many members do we have by group?" — requires report-member-count
- "Which members haven't logged in for 90 days?" — requires report-member-activity
- "What member groups exist?" — requires list-member-groups

## File Structure

```
src/umbraco-api/tools/
  member/
    index.ts
    get/
      search-members.ts
      get-member.ts
      list-member-types.ts
    post/
      create-member.ts
    put/
      update-member.ts
    delete/
      delete-member.ts
    __tests__/
  member-group/
    index.ts
    get/
      list-member-groups.ts
    post/
      create-member-group.ts
    delete/
      delete-member-group.ts
    __tests__/
  member-reporting/
    index.ts
    get/
      report-member-count.ts
      report-members-by-group.ts
      report-member-activity.ts
    __tests__/
```

## Success Criteria

- 12 new tools registered and working in both stdio and hosted modes
- Member delete has permanent deletion warning with default unchecked
- Member group delete warns about group assignment loss
- Reporting tools return chart-ready data
- Integration and eval tests pass
- Total tool count: 73 (61 existing + 12 new)
