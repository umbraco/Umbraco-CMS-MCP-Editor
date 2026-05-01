/**
 * Runtime helpers
 *
 * Cloudflare Workers have no Node `process` global, so `typeof process` is a
 * reliable hosted-vs-stdio discriminator. Use this from collection `tools()`
 * exports or tool `enabled()` hooks to gate tools that only make sense in the
 * hosted runtime (e.g. per-user notification subscriptions that target the
 * OAuth user rather than a static API user).
 *
 * The `UMBRACO_ENABLE_HOSTED_TOOLS=true` env var forces hosted-runtime
 * behaviour from stdio — the tools register and their handlers run, with
 * the static API user as the subject. Used by the eval suite so notification
 * scenarios can exercise the tools end-to-end without spinning up a Worker.
 */

export const isHostedRuntime = (): boolean => {
  if (typeof process === "undefined") return true;
  const override = (process.env.UMBRACO_ENABLE_HOSTED_TOOLS ?? "").toLowerCase();
  return override === "true" || override === "1" || override === "yes";
};
