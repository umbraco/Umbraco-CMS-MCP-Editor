/**
 * Runtime helpers
 *
 * Cloudflare Workers have no Node `process` global, so `typeof process` is a
 * reliable hosted-vs-stdio discriminator. Use this from collection `tools()`
 * exports or tool `enabled()` hooks to gate tools that only make sense in the
 * hosted runtime (e.g. per-user notification subscriptions that target the
 * OAuth user rather than a static API user).
 */

export const isHostedRuntime = (): boolean => typeof process === "undefined";
