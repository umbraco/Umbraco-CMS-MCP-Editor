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

/**
 * A global concurrency cap, independent of call-site nesting. Unlike
 * `mapWithConcurrency` — which only bounds concurrency within a single call
 * (so recursive call sites, e.g. a tree walk, each get their own independent
 * pool, multiplying the effective ceiling by depth) — a single `Semaphore`
 * instance shared across an entire operation caps real concurrent work at
 * exactly `limit`, however many call sites `acquire()` it. FIFO queue: callers
 * that block wait their turn in the order they called `acquire()`.
 */
export class Semaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];
  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.limit) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.current--;
    }
  }
}
