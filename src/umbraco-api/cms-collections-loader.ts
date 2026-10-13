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

let loaded: CmsCollectionsModule | undefined;
let loading: Promise<CmsCollectionsModule> | undefined;

export function loadCmsCollections(): Promise<CmsCollectionsModule> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import("@umbraco-cms/mcp-dev/collections").then((mod) => (loaded = mod));
  return loading;
}

/**
 * The collections module, once loadCmsCollections() has resolved. For
 * synchronous readers (the chained server's consent config), which only run
 * inside request handlers after the worker's fetch entry has loaded it.
 */
export function getLoadedCmsCollections(): CmsCollectionsModule {
  if (!loaded) {
    throw new Error("@umbraco-cms/mcp-dev collections are not loaded yet: await loadCmsCollections() first.");
  }
  return loaded;
}
