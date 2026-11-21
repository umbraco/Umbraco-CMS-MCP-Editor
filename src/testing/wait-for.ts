/**
 * Poll `fn` until it returns a non-undefined value, or give up after `timeoutMs`
 * and return the last result (undefined).
 *
 * Since Umbraco 19, search indexing is asynchronous: a freshly created document
 * or element only shows up in `item/.../search` results a second or two later.
 * Search tests use this to wait for their own fixture to be indexed rather than
 * asserting on the very first response.
 */
export async function waitFor<T>(
  fn: () => Promise<T | undefined>,
  { timeoutMs = 15000, intervalMs = 500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined || Date.now() >= deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
