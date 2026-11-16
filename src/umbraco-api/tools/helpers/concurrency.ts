/**
 * Concurrency Helper
 *
 * A small worker-pool for running async work over a list with a cap on how
 * many run at once. Unlike `Promise.all(items.map(fn))`, this never has more
 * than `limit` calls to `fn` in flight — needed for tree-walking tools that
 * fan out one chained CMS call per sibling: fetching every sibling at once
 * (`Promise.all`) hammers the Umbraco API as hard as the widest level of the
 * tree, while fetching one at a time serializes every round trip (the root
 * cause of https://github.com/umbraco/Umbraco-CMS-MCP-Editor/issues/306).
 *
 * No existing dependency in this repo provides this (no `p-limit` or
 * similar), so it's implemented directly rather than adding one — see
 * CLAUDE.md's "Don't upgrade dependency versions unprompted" guidance, which
 * reads equally as a reason not to add a new one for something this small.
 */

/**
 * Run `fn` over every item in `items`, at most `limit` calls in flight at
 * once, and return the results in the same order as `items` (not completion
 * order). `limit` is clamped to at least 1 and to `items.length` so an empty
 * or short list never spins up idle workers.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) return results;

  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
