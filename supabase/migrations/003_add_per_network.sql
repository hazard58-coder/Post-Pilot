-- ─────────────────────────────────────────────────────────────
-- PostPilot — Add per_network column to posts
-- Run AFTER 002_rls_policies.sql
-- ─────────────────────────────────────────────────────────────

-- Stores per-platform content overrides as a JSON object, e.g.:
-- { "twitter": "Shorter version", "linkedin": "Professional version" }
-- Defaults to {} so existing rows are unaffected.
alter table public.posts
  add column if not exists per_network jsonb not null default '{}';
