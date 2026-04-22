# Show Full Page Path (Breadcrumb)

## The Friction

In the Umbraco UI, the content tree shows the hierarchy, but when an editor searches for a page, they get a flat list of results. Two pages called "Contact" might appear — one under "Services" and one under "About". The editor can't tell which is which without clicking each one.

The search results show the page name but not its location in the tree. The same applies when viewing references ("Referenced by: Contact, Contact") — which Contact?

## Proposed Enhancement to Existing Tools

Every tool that returns page names should also return the **path** — the breadcrumb from root to the page.

Instead of:
```
name: "Contact"
```

Return:
```
name: "Contact"
path: "Home > Services > Contact"
```

## Where This Helps

- `search-content` results — distinguish same-named pages
- `report-*` tools — every report that lists pages
- `where-is-this-used` — "Referenced by Home > Blog > Article 1"
- `list-children` — show where in the tree you are
- Any tool output that includes page names

## API Endpoint

- `GET /tree/document/ancestors` — returns the ancestor chain for any node

## Implementation

When returning page data, call the ancestors endpoint to build the breadcrumb path. Cache aggressively since the tree structure rarely changes during a conversation.

## Why It Matters

It's a small thing, but it eliminates a constant micro-friction: "Which 'Contact' page is this?" Every time an editor sees an ambiguous name in a result, they have to go click on it to find out where it is. The path removes that ambiguity instantly.

This is especially important for larger sites where page names repeat across sections.
