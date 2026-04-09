-- Performance indexes for high-traffic scenarios

-- Composite index for posts queries (most common)
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_company_status_scheduled_idx
  ON public.posts (company_id, status, scheduled_date DESC);

-- Partial index for active posts only
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_active_idx
  ON public.posts (company_id, scheduled_date)
  WHERE status IN ('scheduled', 'published');

-- Index for user posts (less common but important)
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_user_scheduled_idx
  ON public.posts (user_id, scheduled_date DESC);

-- Index for platform filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_platforms_idx
  ON public.posts USING GIN (platforms);

-- Index for hashtag searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_hashtags_idx
  ON public.posts USING GIN (hashtags);

-- Index for engagement queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_engagement_idx
  ON public.posts ((engagement->>'likes')::int DESC)
  WHERE status = 'published';

-- Update statistics for better query planning
ANALYZE public.posts;