/**
 * Unit coverage for `Semaphore` (added for Umbraco-CMS-MCP-Editor#306's
 * concurrency-cap fix in report-site-tree-summary.ts). `mapWithConcurrency`
 * shipped without a direct unit test despite having a testable contract —
 * this covers `Semaphore`'s so that gap isn't repeated.
 */

import { describe, it, expect } from "@jest/globals";
import { Semaphore } from "../concurrency.js";

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
