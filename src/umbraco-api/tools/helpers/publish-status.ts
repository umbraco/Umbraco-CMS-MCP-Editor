import { z } from "zod";

export const PUBLISHED_STATES = new Set(["Published", "PublishedPendingChanges"]);

export const publishStatusVariantSchema = z.object({
  name: z.string(),
  culture: z.string().nullable(),
  state: z.string(),
  publishDate: z.string().nullable(),
  scheduledPublishDate: z.string().nullable(),
  scheduledUnpublishDate: z.string().nullable(),
});

export const publishStatusSchema = z.object({
  isPublished: z.boolean(),
  state: z.string(),
  variants: z.array(publishStatusVariantSchema),
});

export type PublishStatus = z.infer<typeof publishStatusSchema>;

interface DocLike {
  variants?: ReadonlyArray<{
    name?: string | null;
    culture?: string | null;
    state?: string | null;
    publishDate?: string | null;
    scheduledPublishDate?: string | null;
    scheduledUnpublishDate?: string | null;
  }>;
}

export function buildPublishStatus(doc: DocLike): PublishStatus {
  const variants = (doc.variants ?? []).map((v) => ({
    name: v.name ?? "",
    culture: v.culture ?? null,
    state: v.state ?? "Unknown",
    publishDate: v.publishDate ?? null,
    scheduledPublishDate: v.scheduledPublishDate ?? null,
    scheduledUnpublishDate: v.scheduledUnpublishDate ?? null,
  }));
  const isPublished = variants.some((v) => PUBLISHED_STATES.has(v.state));
  return {
    isPublished,
    state: isPublished ? "Published" : "NotPublished",
    variants,
  };
}
