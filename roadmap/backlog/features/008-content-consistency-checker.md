# Content Consistency Checker

## The Editor's Problem

Large sites accumulate inconsistencies over time, especially when multiple editors work on content:
- The same product is called "Pro Plan", "Professional Plan", and "Pro Package" on different pages
- Phone numbers differ between the Contact page and the footer
- Addresses are outdated on some pages but correct on others
- CTAs use different wording for the same action
- Brand terminology drifts ("log in" vs "login" vs "sign in")

In the UI, there's no way to detect these inconsistencies. An editor would have to read every page on the site and compare them manually.

## What This Enables

**"Are we consistent with how we refer to our products?"** — The LLM scans all content for product names and flags variations.

**"Check that our contact details are the same everywhere"** — Find all pages mentioning phone numbers, emails, or addresses and compare them.

**"Audit our CTAs for consistency"** — Find all call-to-action text and group by similarity, highlighting outliers.

**"Do we use British or American spelling consistently?"** — Check for mixed spelling conventions across the site.

## How It Works

1. `search-content` or `list-children` — gather relevant pages
2. `get-page` — read content from each page
3. LLM analysis — scan for:
   - Entity name variations (products, services, team names)
   - Contact information mismatches
   - Terminology inconsistencies
   - Spelling/style convention violations
   - Factual contradictions between pages
4. Report grouped findings with page references

## Why This Goes Beyond the UI

No CMS UI can detect semantic inconsistencies. This is pure LLM territory — understanding that "Sign up free" and "Start your free trial" and "Get started for free" on three different pages might need to be aligned, or that "02071234567" and "+44 207 123 4567" are the same phone number in different formats.

The LLM reads content like a proofreader reading the entire site at once.

## Compound Scenarios

- **Brand audit**: Check terminology + style + tone across all content
- **Merger/rebrand**: Find all references to old brand and ensure none were missed
- **Multi-editor quality**: After a sprint of content creation by multiple authors, run a consistency pass

## Editor Story

> "We have 5 editors who've been building out the new product pages. Can you check everything is consistent before we launch?"

The LLM scans all product pages and reports: "The pricing page says 'Premium Plan' but the features page calls it 'Premium Tier'. The Support email is listed as support@acme.com on 3 pages but help@acme.com on 2 pages. The homepage says '24/7 support' but the pricing page says 'business hours support'."
