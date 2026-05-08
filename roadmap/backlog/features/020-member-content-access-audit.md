# Member and Content Access Audit

## The Editor's Problem

On sites with member areas, editors need to understand the relationship between members, member groups, and protected content. Questions like:
- "What content can Gold members see?"
- "Which pages are restricted?"
- "How many members are in each group?"
- "Who signed up this month?"

These require cross-referencing member groups, member data, and public access settings — three different sections in the UI.

## What This Enables

**"Show me an overview of our member area"** — How many members, which groups, what content is protected, what access rules are in place.

**"What can a new member see vs a premium member?"** — Compare content access across member groups.

**"Our membership numbers this quarter"** — Combine `report-member-count`, `report-member-activity`, and `report-members-by-group` into a clear summary.

**"Find members who haven't logged in for 6 months"** — Inactive member identification for re-engagement campaigns.

## How It Works

1. `report-member-count` — total members
2. `report-members-by-group` — breakdown by group
3. `report-member-activity` — login/signup activity
4. `search-members` — find specific members
5. Public access API (`GET /document/{id}/public-access`) — check content restrictions
6. Cross-reference: map member groups → protected content → member counts

## Why This Goes Beyond the UI

The Members section shows a list of members. The Content section shows public access settings per page. There's no cross-reference view. The LLM can build the full picture: "Your Gold Members group has 234 members and can access 12 pages. 45 of those members haven't logged in since January."

## Editor Story

> "We're reviewing our membership tiers. Can you show me how many members are in each group and what content each group can access?"

The LLM produces a complete membership overview: group sizes, access rights, activity levels, and content behind each tier.
