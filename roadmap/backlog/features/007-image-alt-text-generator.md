# Intelligent Alt Text Generator

## The Editor's Problem

Accessibility regulations require meaningful alt text on all images. A typical Umbraco site might have hundreds of images, many uploaded without alt text. In the UI, an editor has to:

1. Open each media item individually
2. Look at the image
3. Write appropriate alt text
4. Save
5. Repeat for every image

Our `report-media-missing-alt` tool already finds images without alt text. But the editor still has to write and apply alt text one image at a time.

## What This Enables

**"Add alt text to all images missing it in the Sample Images folder"** — The LLM uses the media URLs to understand the images (via multimodal capabilities), generates appropriate descriptive alt text, and applies it in bulk.

**"Review and improve all alt text on the site"** — Not just missing alt text, but bad alt text. "IMG_0234.jpg" or "photo" aren't helpful. The LLM can identify low-quality alt text and suggest improvements.

**"Make alt text consistent with our brand voice"** — Apply brand guidelines to alt text: formal vs casual, descriptive style, inclusion of product names.

## How It Works

1. `report-media-missing-alt` — find images needing alt text
2. `get-media` — get image URLs and metadata
3. The LLM views each image (multimodal) or infers from filename/context
4. Generate contextually appropriate alt text
5. `edit-media` (proposed in explore/012) — apply the alt text
6. Bulk confirmation: "I'll add alt text to 45 images. Here are the first 10 for review..."

## Key Design Decision: Context-Aware Alt Text

Alt text should describe the image's **purpose** on the page, not just what's in it. A photo of a team might be:
- "Our customer support team" on the Contact page
- "Award-winning team at annual conference" on the About page
- Purely decorative (empty alt) if used as a background texture

The LLM can check `GET /media/{id}/referenced-by` to see which pages use each image, read those pages' context, and write alt text that's appropriate for how the image is actually used.

## Why This Goes Beyond the UI

The UI can't generate alt text. It can't even show you all images missing alt text in one view — you'd need to browse through every media folder. The combination of image understanding, content context awareness, and bulk application is something only an LLM can do.

## Accessibility Compliance Value

- WCAG 2.1 AA requires meaningful alt text on all informative images
- Many organisations face legal requirements for accessibility
- A tool that can fix hundreds of images in minutes vs hours is extremely valuable
- Can generate alt text in multiple languages for multilingual sites

## Editor Story

> "Our accessibility audit flagged 200 images without alt text. Can you fix that?"

The LLM finds all images missing alt text, generates descriptions for each one, shows the editor a sample for approval, then bulk-applies all 200 in minutes. Total time: 5 minutes instead of 2 days.
