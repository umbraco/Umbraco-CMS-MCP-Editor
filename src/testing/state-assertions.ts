/**
 * State assertions for integration tests.
 *
 * Each helper performs a follow-up read after a state-changing tool call to
 * confirm the intended outcome actually landed. This catches bugs where a
 * tool's API call returns success but a downstream handler (workflow, event
 * subscriber, schema misset) silently reverts the change — e.g. publish-page
 * returning "Published" while the document remains in Draft.
 *
 * Usage:
 *   import { expectUnpublished } from "../../../../testing/state-assertions.js";
 *   await unpublishPageTool.handler({ id }, extra);
 *   await expectUnpublished(id, extra);
 */

import { expect } from "@jest/globals";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import getPublishStatusTool from "../umbraco-api/tools/scheduling/get/get-publish-status.js";
import listRecycleBinTool from "../umbraco-api/tools/recycle-bin/get/list-recycle-bin.js";
import getPublicAccessTool from "../umbraco-api/tools/public-access/get/get-public-access.js";

type Extra = Parameters<typeof getPublishStatusTool.handler>[1];

async function readPublishStatus(id: string, extra: Extra) {
  const result = await getPublishStatusTool.handler({ id }, extra);
  return getStructuredContent(result) as {
    isPublished: boolean;
    state: string;
    variants: Array<{
      culture: string | null;
      state: string;
      publishDate: string | null;
      scheduledPublishDate: string | null;
      scheduledUnpublishDate: string | null;
    }>;
  };
}

export async function expectPublished(id: string, extra: Extra): Promise<void> {
  const status = await readPublishStatus(id, extra);
  expect(status.isPublished).toBe(true);
  expect(status.state).toBe("Published");
}

export async function expectUnpublished(id: string, extra: Extra): Promise<void> {
  const status = await readPublishStatus(id, extra);
  expect(status.isPublished).toBe(false);
}

export async function expectScheduledFor(
  id: string,
  expected: { publishDate?: string | null; unpublishDate?: string | null },
  extra: Extra,
): Promise<void> {
  const status = await readPublishStatus(id, extra);
  const variant = status.variants[0];
  expect(variant).toBeDefined();
  if (expected.publishDate !== undefined) {
    expect(variant.scheduledPublishDate).toBe(expected.publishDate);
  }
  if (expected.unpublishDate !== undefined) {
    expect(variant.scheduledUnpublishDate).toBe(expected.unpublishDate);
  }
}

export async function expectNoSchedule(id: string, extra: Extra): Promise<void> {
  const status = await readPublishStatus(id, extra);
  const variant = status.variants[0];
  if (!variant) return; // unpublished pages have no variants — also no schedule
  expect(variant.scheduledPublishDate).toBeNull();
  expect(variant.scheduledUnpublishDate).toBeNull();
}

async function isInRecycleBin(
  id: string,
  type: "content" | "media",
  extra: Extra,
): Promise<boolean> {
  // The list-recycle-bin tool is wrapped with cursor pagination, so it accepts
  // an opaque cursor instead of take/skip. Encode one that returns up to 100
  // entries — enough to find any single id a test just trashed.
  const cursor = encodeCursor({ s: 0, t: 100 });
  const result = await listRecycleBinTool.handler({ type, cursor } as any, extra);
  const data = getStructuredContent(result) as { items: Array<{ id: string }> } | undefined;
  return !!data?.items?.some((item) => item.id === id);
}

export async function expectInRecycleBin(
  id: string,
  type: "content" | "media",
  extra: Extra,
): Promise<void> {
  expect(await isInRecycleBin(id, type, extra)).toBe(true);
}

export async function expectNotInRecycleBin(
  id: string,
  type: "content" | "media",
  extra: Extra,
): Promise<void> {
  expect(await isInRecycleBin(id, type, extra)).toBe(false);
}

export async function expectPublicAccess(
  id: string,
  extra: Extra,
): Promise<void> {
  const result = await getPublicAccessTool.handler({ id }, extra);
  const data = getStructuredContent(result) as { hasRestrictions: boolean };
  expect(data.hasRestrictions).toBe(true);
}

export async function expectNoPublicAccess(
  id: string,
  extra: Extra,
): Promise<void> {
  const result = await getPublicAccessTool.handler({ id }, extra);
  const data = getStructuredContent(result) as { hasRestrictions: boolean };
  expect(data.hasRestrictions).toBe(false);
}
