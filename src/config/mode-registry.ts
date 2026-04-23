/**
 * Tool Mode Registry
 *
 * Defines tool modes that group tools by domain/functionality.
 * Modes map to collections, allowing users to enable groups of related tools.
 *
 * This is the SINGLE SOURCE OF TRUTH for mode definitions in this project.
 */

import type { ToolModeDefinition } from "@umbraco-cms/mcp-server-sdk";

/**
 * Tool mode definitions for this project.
 *
 * Each mode groups related tool collections together.
 * Users can enable modes in their config to include all tools in those collections.
 *
 * @example
 * ```typescript
 * // In server config
 * {
 *   toolModes: ['content', 'media']  // Enables all tools in content and media collections
 * }
 * ```
 */
export const toolModes: ToolModeDefinition[] = [
  {
    name: 'content',
    displayName: 'Content Management',
    description: 'Create, edit, search, and manage content pages',
    collections: ['content', 'publishing', 'versioning']
  },
  {
    name: 'media',
    displayName: 'Media Management',
    description: 'Browse, search, upload, and manage media files and folders',
    collections: ['media', 'media-management']
  },
  {
    name: 'blueprints',
    displayName: 'Blueprints',
    description: 'List, view, and create page blueprints (templates)',
    collections: ['blueprint']
  },
  {
    name: 'translation',
    displayName: 'Translation',
    description: 'Manage languages, content variants, and dictionary translations',
    collections: ['language', 'translation', 'dictionary']
  },
  {
    name: 'tags',
    displayName: 'Tags',
    description: 'Browse tags in use across the site',
    collections: ['tag']
  },
  {
    name: 'content-health',
    displayName: 'Content Health',
    description: 'Content auditing, SEO analysis, and content reporting',
    collections: ['content-health', 'content-reporting']
  },
  {
    name: 'site-structure',
    displayName: 'Site Structure',
    description: 'Site architecture analysis and structure reporting',
    collections: ['site-structure']
  },
  {
    name: 'media-health',
    displayName: 'Media Health',
    description: 'Media library health and usage analysis',
    collections: ['media-health']
  },
  {
    name: 'bulk-operations',
    displayName: 'Bulk Operations',
    description: 'Bulk publish, unpublish, schedule, edit, and move content pages (max 10 per call)',
    collections: ['bulk-operations']
  },
  {
    name: 'members',
    displayName: 'Members',
    description: 'Manage members, member groups, and member reporting',
    collections: ['member', 'member-group', 'member-reporting']
  },
  {
    name: 'scheduling',
    displayName: 'Scheduling',
    description: 'View and manage scheduled content publishing',
    collections: ['scheduling']
  },
  {
    name: 'redirects',
    displayName: 'Redirects',
    description: 'View and manage URL redirects',
    collections: ['redirect']
  },
  {
    name: 'relationships',
    displayName: 'Content Relationships',
    description: 'View inbound/outbound references, relationship mapping, and external link inventory',
    collections: ['relationships']
  },
  {
    name: 'public-access',
    displayName: 'Public Access',
    description: 'Restrict content pages to members of specific groups (member-gated content)',
    collections: ['public-access']
  },
  {
    name: 'notifications',
    displayName: 'Content Notifications',
    description: 'Manage per-user email notification subscriptions on content pages (hosted-only)',
    collections: ['notifications']
  },
];

/**
 * All mode definitions (alias for toolModes).
 */
export const allModes: ToolModeDefinition[] = [...toolModes];

/**
 * All valid mode names for configuration validation.
 */
export const allModeNames: readonly string[] = toolModes.map(m => m.name);

/**
 * Valid mode name type.
 */
export type ToolModeName = typeof allModeNames[number];
