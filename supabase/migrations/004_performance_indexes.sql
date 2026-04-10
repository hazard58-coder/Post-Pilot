-- Performance indexes
-- NOTE: CONCURRENTLY is intentionally omitted — it cannot run inside a
-- transaction block, which is how both the Supabase SQL editor and the
-- Supabase CLI execute migrations. Standard CREATE INDEX is used instead.

CREATE INDEX IF NOT EXISTS posts_company_status_scheduled_idx
  ON public.posts (company_id, status, scheduled_date DESC);

CREATE INDEX IF NOT EXISTS posts_active_idx
  ON public.posts (company_id, scheduled_date)
  WHERE status IN ('scheduled', 'published');

CREATE INDEX IF NOT EXISTS posts_user_scheduled_idx
  ON public.posts (user_id, scheduled_date DESC);

CREATE INDEX IF NOT EXISTS posts_platforms_idx
  ON public.posts USING GIN (platforms);

CREATE INDEX IF NOT EXISTS posts_hashtags_idx
  ON public.posts USING GIN (hashtags);

ANALYZE public.posts;
