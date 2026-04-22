# Bug: get-media Output Validation Error

> **Status:** ✅ Fixed — commit `f272e3d` ("fix: fix media tool bugs found by evals"). `get-media.ts` now coerces `mediaType` from an object to a string via `alias ?? name`. Snapshot test in `media/__tests__/get-media.test.ts` covers it.

## Problem

The `get-media` tool has an **output validation error**. When called with a valid media item ID, it fails with:

```
MCP error -32602: Output validation error: Invalid structured content for tool get-media: [
  {
    "expected": "string",
    "code": "invalid_type",
    "path": ["mediaType"],
    "message": "Invalid input: expected string, received object"
  }
]
```

The `mediaType` field in the output schema expects a `string`, but the CMS API is returning an `object` (likely the full media type details rather than just the alias/name).

## Reproduction Steps

1. Call `list-media-children` to get a media item ID (e.g. `5598b628-b390-4532-8bb5-dab06089e9d7`)
2. Call `get-media` with that ID
3. Tool fails with output validation error

## Fix

Update the `get-media` output schema to handle the media type as an object, or transform the API response to extract just the media type name/alias as a string before returning.

## Impact

High — `get-media` is a core tool that is broken. It affects any workflow that needs to read media item details.
