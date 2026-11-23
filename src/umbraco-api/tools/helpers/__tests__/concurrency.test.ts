/**
 * Unit coverage for the concurrency helpers added for
 * Umbraco-CMS-MCP-Editor#306's concurrency-cap fix in
 * report-site-tree-summary.ts: `mapWithConcurrency` and `Semaphore`.
 */

import { describe, it, expect } from "@jest/globals";
import { mapWithConcurrency, Semaphore } from "../concurrency.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("returns an empty array for an empty list without calling fn", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 5, async () => {
      calls++;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it("returns results in input order, not completion order", async () => {
    // Earlier items take longer, so they finish last.
    const results = await mapWithConcurrency([30, 20, 10, 0], 4, async (ms, index) => {
      await delay(ms);
      return index;
    });
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("never has more than `limit` calls in flight at once", async () => {
    let current = 0;
    let max = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      current++;
      max = Math.max(max, current);
      await delay(5);
      current--;
    });
    expect(max).toBe(3);
  });

  it("treats a limit below 1 as 1, so the list still completes", async () => {
    let current = 0;
    let max = 0;
    const results = await mapWithConcurrency([1, 2, 3], 0, async (item) => {
      current++;
      max = Math.max(max, current);
      await delay(1);
      current--;
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6]);
    expect(max).toBe(1);
  });

  it("rejects when fn rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("boom");
        return item;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("Semaphore", () => {
  it("lets up to `limit` acquires through without blocking", async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    // Neither call above hung, so both were granted immediately.
  });

  it("blocks the next acquire once at capacity, until a release", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(acquired).toBe(false);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
  });

  it("releases queued callers in FIFO order", async () => {
    const sem = new Semaphore(1);
    await sem.acquire(); // holds the only slot

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    const p3 = sem.acquire().then(() => order.push(3));

    sem.release();
    await p1;
    expect(order).toEqual([1]);

    sem.release();
    await p2;
    expect(order).toEqual([1, 2]);

    sem.release();
    await p3;
    expect(order).toEqual([1, 2, 3]);
  });

  it("never lets more than `limit` callers hold the semaphore concurrently", async () => {
    const LIMIT = 3;
    const sem = new Semaphore(LIMIT);
    let current = 0;
    let max = 0;

    async function worker(): Promise<void> {
      await sem.acquire();
      current++;
      max = Math.max(max, current);
      await new Promise((resolve) => setTimeout(resolve, 5));
      current--;
      sem.release();
    }

    await Promise.all(Array.from({ length: 10 }, () => worker()));
    expect(max).toBe(LIMIT);
  });
});
