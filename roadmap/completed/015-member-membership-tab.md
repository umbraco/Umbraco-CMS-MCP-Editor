# Member Membership Tab

## Problem

The Umbraco UI member editor has a **"Membership"** tab that shows membership-specific properties:
- Email address
- Username
- Password (change password)
- Member groups assignment
- Account locked/approved status
- Failed login attempts
- Last login date
- Last lockout date
- Last password change date

Our `get-member` and `update-member` tools handle basic member properties. Investigation shows:

- **`get-member` (read) already surfaces every field shown on the Membership tab** — no work needed there.
- **`update-member` (write) covers name, email, isApproved, isLockedOut, groups, and values — but not username, password, or two-factor toggle.** The CMS `update-member` endpoint accepts all three (see `putMemberByIdBody` in `@umbraco-cms/mcp-dev`), so this is purely a surface-exposure task.
- **Lock/unlock and approve/unapprove are already reachable via `update-member`** by flipping `isLockedOut` / `isApproved`. **Do not build separate `lock-member` / `unlock-member` / `approve-member` wrapper tools** — one capable tool beats four thin wrappers, matches the CMS API shape, and keeps the tool list focused.

## UI Workflow (Reproduction Steps)

1. Navigate to Members section
2. Open a member (e.g. "Eval Test User")
3. Click the **"Membership"** tab
4. View/edit membership fields:
   - Toggle member groups on/off
   - Change email/username
   - Set new password
   - Lock/unlock account
5. Click Save

---

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between Umbraco's Membership tab and our `update-member` tool by exposing the three input fields that are currently missing: `username`, `newPassword`, and `isTwoFactorEnabled`. Password change gets strong elicitation because a mis-fired reset locks a real human out of the site.

**Architecture:** Widen the existing `update-member` input schema with three new optional fields. Thread `username` and `isTwoFactorEnabled` into the existing `data` payload. Pull `newPassword` out of the unconditional flow and gate it behind a dedicated elicitation prompt (reusing `confirmAction` with a custom message). Update tests.

**Tech Stack:** TypeScript, Zod, `@umbraco-cms/mcp-server-sdk` (`confirmAction`, `withStandardDecorators`), Jest.

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/umbraco-api/tools/member/put/update-member.ts` | Modify | Add `username`, `newPassword`, `isTwoFactorEnabled` inputs; wire to CMS payload; elicit on password change |
| `src/umbraco-api/tools/member/__tests__/update-member.test.ts` | Modify | Add test cases for each new field + password elicitation |
| `src/umbraco-api/tools/member/__tests__/helpers/member-builder.ts` | Modify (if needed) | Extend builder if existing one doesn't support password/username seeding |
| `tests/evals/member-workflows.test.ts` | Modify | Add eval scenario covering password reset with elicitation |

No new files, no new collection entries.

### Task 1: Widen `update-member` input schema

**Files:**
- Modify: `src/umbraco-api/tools/member/put/update-member.ts:5-16`

- [ ] **Step 1:** Add the three missing optional fields to `inputSchema`:

    ```ts
    username: z.string().optional().describe("New username. Changing the username affects how the member signs in — verify with the user before using this."),
    newPassword: z.string().min(1).optional().describe("Set a new password for the member. This is a sensitive operation and will ask for confirmation before applying."),
    isTwoFactorEnabled: z.boolean().optional().describe("Whether two-factor authentication is enabled for this member"),
    ```

- [ ] **Step 2:** Update the tool description to mention these new capabilities in one sentence without turning it into a changelog.

### Task 2: Thread fields through to the CMS payload

**Files:**
- Modify: `src/umbraco-api/tools/member/put/update-member.ts:41-56`

- [ ] **Step 1:** In the handler, pull out the new destructured inputs:

    ```ts
    handler: async ({ id, name, email, isApproved, isLockedOut, groups, values, username, newPassword, isTwoFactorEnabled }, extra) => {
    ```

- [ ] **Step 2:** In the `data` object, replace the hardcoded `username: existingUsername` with `username: username ?? existingUsername`.

- [ ] **Step 3:** Add `isTwoFactorEnabled: isTwoFactorEnabled ?? member.isTwoFactorEnabled ?? false` to the `data` object.

- [ ] **Step 4:** Do **not** add `newPassword` to the data object yet — that goes through the elicitation path in Task 3.

### Task 3: Gate password changes behind elicitation

**Files:**
- Modify: `src/umbraco-api/tools/member/put/update-member.ts`

- [ ] **Step 1:** After the initial `get-member` fetch and before the `mcpClientManager.callTool("cms", "update-member", ...)` call, add a password-change branch:

    ```ts
    if (newPassword !== undefined) {
      const confirmed = await confirmAction(
        extra,
        `Reset the password for "${memberName}"? The old password will no longer work — make sure the member knows their new password.`,
        { title: "Confirm password reset" }
      );
      if (!confirmed) {
        return createToolResult({
          message: `Password reset cancelled for "${memberName}"`,
          id,
          name: name ?? memberName,
          email: email ?? memberEmail,
        });
      }
      (data as any).newPassword = newPassword;
    }
    ```

- [ ] **Step 2:** Import `confirmAction` from `@umbraco-cms/mcp-server-sdk` at the top of the file if not already imported.

- [ ] **Step 3:** Update the output message to say `"Updated member '...' (password changed)"` when a password reset succeeded, so the LLM has a clear signal to surface to the user.

### Task 4: Update integration tests

**Files:**
- Modify: `src/umbraco-api/tools/member/__tests__/update-member.test.ts`

- [ ] **Step 1:** Add test: **can update username**. Create member via builder, call `update-member` with a new username, assert success and re-read via `get-member`.

- [ ] **Step 2:** Add test: **can toggle isTwoFactorEnabled**. Create member, call `update-member` with `isTwoFactorEnabled: true`, assert re-read shows true.

- [ ] **Step 3:** Add test: **password change requires elicitation (confirmed path)**. Use `setupEditorElicitation(jest.fn().mockResolvedValue({ action: "accept", content: { confirmed: true } }))` so the prompt auto-accepts. Call `update-member` with `newPassword: "NewPassword123!"`. Assert the member record updates (tests the handler branch) and the output message reflects the password change.

- [ ] **Step 4:** Add test: **password change requires elicitation (declined path)**. Mock elicitation to return `{ confirmed: false }`. Call `update-member` with a password. Assert message says "cancelled" and assert the password did **not** change by attempting a CMS-level login check (or alternatively, assert no `newPassword` was sent by spying on `mcpClientManager.callTool`).

- [ ] **Step 5:** Extend `member-builder.ts` helper only if these tests need a builder method to seed a known password for verification. Skip if the CMS doesn't let us verify password server-side and the spy approach is enough.

- [ ] **Step 6:** Run `npm run test:one -- --testPathPattern='member/__tests__/update-member'`. All existing tests must still pass; new tests must pass.

### Task 5: Add eval coverage

**Files:**
- Modify: `tests/evals/member-workflows.test.ts`

- [ ] **Step 1:** Add a scenario: **LLM resets a locked-out member's password**. Prompt: "Member X is locked out and forgot their password. Unlock them and set their password to a temporary value, they'll reset it on next login." Required tools: `search-members`, `update-member`. Success pattern: member is unlocked and a password-reset elicitation happened.

- [ ] **Step 2:** Add the updated `update-member` description to any eval that references the tool's description to keep the LLM's mental model fresh (if applicable).

### Task 6: Verify and commit

- [ ] **Step 1:** Run `npm run compile` — must be clean (except pre-existing errors unrelated to this change).

- [ ] **Step 2:** Run full integration suite: `npm test`. All 126+ suites must pass.

- [ ] **Step 3:** Run evals: `npm run test:evals -- --testPathPattern='member-workflows'`. The new scenario must pass; existing scenarios unaffected.

- [ ] **Step 4:** Commit with message referencing this plan. One commit is fine — it's a focused enhancement.

## Out of Scope (Do Not Build)

- Separate `lock-member` / `unlock-member` / `approve-member` / `assign-member-to-group` wrapper tools. All four operations are already trivially expressible via `update-member`. Adding wrappers bloats the tool surface without giving the LLM any capability it doesn't already have. If eval results show the LLM consistently fumbles `update-member` for these, revisit — but do not pre-optimise.
- Incremental group add/remove (current behaviour replaces the full group array). The CMS API itself only accepts a full replacement; simulating incremental by fetch-modify-PUT would be race-prone and more code. Document the replacement behaviour clearly in the tool description and let the LLM read-before-write.
- Username *search*. Already covered by `search-members`. No new tool needed.

## Risk Notes

- **Password reset cannot be undone via this tool.** The old password is irretrievable once replaced. Strong elicitation mitigates mis-fires; the output message explicitly states the old password no longer works so the LLM can relay that to the user.
- **Username changes break login flows for the affected member.** The elicitation here is handled at the tool description level ("verify with the user before using this") rather than an in-flow prompt, because username changes are a known destructive intent (the user asked for it). Promote to elicitation if eval results show LLMs changing usernames speculatively.
- **Two-factor toggle is reversible and low-risk.** No elicitation needed.

## Success Criteria

- `update-member` accepts `username`, `newPassword`, `isTwoFactorEnabled`.
- A password reset requires confirmation every time; declined confirmations do not change the password.
- All existing tests pass; new tests for each new field pass; at least one eval covers the password-reset flow end-to-end.

## Impact

Medium — member management is important for sites with member areas.
