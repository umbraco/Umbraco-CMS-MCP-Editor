/**
 * notifications collection gating
 *
 * Unit-level checks that verify the collection's runtime gate. Hosted-only
 * tools are filtered out when the server runs under Node (stdio) — this
 * test locks that contract in so a future refactor of the `tools()` hook
 * doesn't accidentally expose the static API user to notification writes.
 */

import { describe, it, expect } from "@jest/globals";

import notificationsCollection from "../index.js";
import getContentNotificationsTool from "../get/get-content-notifications.js";
import setContentNotificationsTool from "../put/set-content-notifications.js";
import { isHostedRuntime } from "../../helpers/runtime.js";

describe("notifications collection gating", () => {
  it("runs under Node, so isHostedRuntime() is false", () => {
    expect(isHostedRuntime()).toBe(false);
  });

  it("exposes no tools in stdio runtime", () => {
    expect(notificationsCollection.tools({})).toEqual([]);
  });

  it("declares enabled: isHostedRuntime on get-content-notifications", () => {
    expect(getContentNotificationsTool.enabled).toBe(isHostedRuntime);
  });

  it("declares enabled: isHostedRuntime on set-content-notifications", () => {
    expect(setContentNotificationsTool.enabled).toBe(isHostedRuntime);
  });
});
