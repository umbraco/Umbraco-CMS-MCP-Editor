# Clear a Property Value

## The Friction

An editor wants to remove a value: clear the subtitle, remove the hero image, empty the meta description. In the UI, this varies by property type:
- Text: select all, delete
- Media picker: click "Clear file(s)" or the X button
- Content picker: find and click the remove button
- Block list: delete each block one at a time
- Toggle: click to flip

Each property type has a different clearing mechanism. And to do this across multiple pages is the same page-by-page slog.

## Proposed Tool: `clear-property`

**Input:**
- `id` (uuid or array) — page(s)
- `alias` (string) — property to clear

**Behaviour:**
1. Read current value to show what will be removed
2. Confirm: "Clear 'subtitle' on 'Homepage'? Current value: 'Welcome to our site'"
3. Set to null/empty
4. Save

## Why It Matters

It's the opposite of `edit-page` — instead of setting a value, you're removing one. Sounds trivial, but `edit-page` with `value: null` isn't obvious, and the confirmation showing the current value before clearing is important safety.

Bulk clearing is where this really shines: "Clear the meta keywords on all pages" (because meta keywords are obsolete for SEO). One command instead of opening 50 pages.
