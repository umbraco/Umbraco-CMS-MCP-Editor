/**
 * Loads @umbraco-cms/mcp-dev's collections on first use instead of at module
 * scope.
 *
 * Importing the collections builds the input/output schemas of every mcp-dev
 * tool. In the hosted worker that ran during Worker startup, which Cloudflare
 * caps at 1 s of CPU, and the v18 Editor worker had reached about 930 ms.
 * Loading it from the first request (worker.ts fetch / init()) moves that cost
 * out of startup.
 *
 * The loaded module is the same static code for every session, so caching it
 * at module level shares no per-session state.
 */
type CmsCollectionsModule = typeof import("@umbraco-cms/mcp-dev/collections");

/** @internal Exported for tests; use loadCmsCollections / getLoadedCmsCollections. */
export function createCmsCollectionsLoader<T>(importModule: () => Promise<T>) {
  let loaded: T | undefined;
  let loading: Promise<T> | undefined;

  return {
    load(): Promise<T> {
      if (loaded) return Promise.resolve(loaded);
      loading ??= importModule().then(
        (mod) => (loaded = mod),
        (error: unknown) => {
          // Don't cache a failed load: the next caller retries.
          loading = undefined;
          throw error;
        },
      );
      return loading;
    },
    get(): T {
      if (!loaded) {
        throw new Error("@umbraco-cms/mcp-dev collections are not loaded yet: await loadCmsCollections() first.");
      }
      return loaded;
    },
  };
}

const loader = createCmsCollectionsLoader<CmsCollectionsModule>(() => import("@umbraco-cms/mcp-dev/collections"));

export const loadCmsCollections = (): Promise<CmsCollectionsModule> => loader.load();

/**
 * The collections module, once loadCmsCollections() has resolved. For
 * synchronous readers (the chained server's consent config), which only run
 * inside request handlers after the worker's fetch entry has loaded it.
 */
export const getLoadedCmsCollections = (): CmsCollectionsModule => loader.get();
