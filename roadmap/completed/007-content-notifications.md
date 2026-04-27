# Content Notifications

## Problem

The Umbraco UI has a **"Notifications..."** entity action on content nodes. This allows users to subscribe to email notifications when specific actions happen to a page:
- When content is saved
- When content is published
- When content is unpublished
- When content is moved/deleted
- When content is sent for approval

We have **no equivalent tool** for managing content notifications.

## UI Workflow (Reproduction Steps)

1. Navigate to Content section
2. Open any content node
3. Click the **"..."** (entity actions menu)
4. Select **"Notifications..."**
5. A dialog shows checkboxes for each notification type
6. Check/uncheck to subscribe/unsubscribe
7. Save

## Assessment

This is a **per-user preference** feature — it controls what email notifications the current backoffice user receives. Its value depends on which identity the MCP server acts as:

- **Stdio mode** — server acts as the static `UMBRACO_CLIENT_ID` API user. Subscribing that user to notifications is pointless; nobody reads that inbox.
- **Hosted worker (OAuth)** — `createPerRequestServer` threads the authenticated user's `AuthProps` into every CMS call (see `src/worker.ts:74-82`), so notification subscriptions target the real logged-in editor. That makes the feature genuinely useful: an editor talking to the agent can say "subscribe me to publish events on this section" and it works.

**Recommendation: Build it, hosted-only.**

## Dev MCP Support

Already covered by `@umbraco-cms/mcp-dev`:
- `get-document-notifications`
- `put-document-notifications`

Chain through `mcpClientManager.callTool("cms", ...)` as with other delegating tools.

## Implementation Notes

Gate the tool to hosted runtime only via the SDK's `enabled` hook. Cloudflare Workers have no `process` global, so `typeof process === "undefined"` is a reliable hosted/stdio discriminator — the pattern is already used at `src/config/mcp-servers.ts:18`.

```ts
// src/umbraco-api/helpers/runtime.ts (new helper)
export const isHostedRuntime = () => typeof process === "undefined";

// tool definition
enabled: isHostedRuntime,
```

Result: on stdio the notifications tool is filtered out at registration time, so it never reaches the LLM. On the hosted worker it appears and operates as the logged-in user.

## Scope

One collection addition (likely `content` or a new lightweight `notifications` collection — decide when scoping), two tools (`get-content-notifications`, `set-content-notifications`), gated behind `isHostedRuntime`. Low-risk, user-scoped writes.

## Impact

- Editors using the hosted agent can manage their own subscriptions conversationally.
- Stdio users see no change — the tool isn't exposed.
- Sets the precedent and the helper (`isHostedRuntime`) for any future hosted-only tooling.
