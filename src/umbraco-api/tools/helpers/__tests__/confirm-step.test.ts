/**
 * Unit tests for the confirmStep UMBRACO_AUTO_CONFIRM bypass.
 *
 * These tests are pure — they do not hit the CMS, so they run without a live
 * Umbraco instance.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { confirmStep } from "../confirm-step.js";
import { setServerRef } from "@umbraco-cms/mcp-server-sdk";

describe("confirmStep UMBRACO_AUTO_CONFIRM bypass", () => {
  const originalEnv = process.env.UMBRACO_AUTO_CONFIRM;
  let elicitInputCalled = false;

  beforeEach(() => {
    elicitInputCalled = false;
    setServerRef({
      elicitInput: async () => {
        elicitInputCalled = true;
        return { action: "decline" };
      },
    } as any);
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.UMBRACO_AUTO_CONFIRM;
    else process.env.UMBRACO_AUTO_CONFIRM = originalEnv;
  });

  it("returns true without eliciting when UMBRACO_AUTO_CONFIRM=true", async () => {
    process.env.UMBRACO_AUTO_CONFIRM = "true";
    const result = await confirmStep({}, "do you confirm?");
    expect(result).toBe(true);
    expect(elicitInputCalled).toBe(false);
  });

  it("elicits and returns false on decline when bypass disabled", async () => {
    delete process.env.UMBRACO_AUTO_CONFIRM;
    const result = await confirmStep({}, "do you confirm?");
    expect(result).toBe(false);
    expect(elicitInputCalled).toBe(true);
  });

  it("treats values other than 'true' as not-bypassed", async () => {
    process.env.UMBRACO_AUTO_CONFIRM = "1";
    const result = await confirmStep({}, "do you confirm?");
    expect(result).toBe(false);
    expect(elicitInputCalled).toBe(true);
  });
});
