// ─────────────────────────────────────────────────────────────
// ONE-TIME DATABASE SETUP ENDPOINT
//
// Runs all migrations via the Supabase Management API.
// No database password needed — just a Supabase access token.
//
// How to use:
//   Visit: https://your-app.vercel.app/api/setup?secret=YOUR_SETUP_SECRET&token=YOUR_SUPABASE_TOKEN
//
// Get your Supabase token:
//   supabase.com → (your account icon, top right) → Account → Access Tokens → Generate new token
// ─────────────────────────────────────────────────────────────

const SETUP_SECRET   = process.env.SETUP_SECRET        || '';
const SUPABASE_URL   = process.env.VITE_SUPABASE_URL   || '';

// Extract project ref from URL: https://abcdef.supabase.co → abcdef
const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || '';

// All migrations as individual statements (Management API runs one query at a time)
const MIGRATIONS = [
  // posts table
  `CREATE TABLE IF NOT EXISTS public.posts (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id     uuid        NOT NULL,
    content        text        NOT NULL DEFAULT '',
    platforms      text[]      NOT NULL DEFAULT '{}',
    post_type      text        NOT NULL DEFAULT 'Post',
    category       text        NOT NULL DEFAULT '',
    hashtags       text[]      NOT NULL DEFAULT '{}',
    status         text        NOT NULL DEFAULT 'scheduled'
                               CHECK (status IN ('scheduled','draft','published','failed')),
    scheduled_date timestamptz NOT NULL,
    engagement     jsonb       NOT NULL DEFAULT '{}',
    media_urls     text[]      NOT NULL DEFAULT '{}',
    per_network    jsonb       NOT NULL DEFAULT '{}',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
  )`,

  // auto-update trigger function
  `CREATE OR REPLACE FUNCTION public.set_updated_at()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN NEW.updated_at = now(); RETURN NEW; END; $$`,

  // trigger
  `DROP TRIGGER IF EXISTS posts_set_updated_at ON public.posts`,
  `CREATE TRIGGER posts_set_updated_at
   BEFORE UPDATE ON public.posts
   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()`,

  // indexes
  `CREATE INDEX IF NOT EXISTS posts_user_id_idx          ON public.posts (user_id)`,
  `CREATE INDEX IF NOT EXISTS posts_company_id_idx       ON public.posts (company_id)`,
  `CREATE INDEX IF NOT EXISTS posts_scheduled_date_idx   ON public.posts (scheduled_date ASC)`,
  `CREATE INDEX IF NOT EXISTS posts_status_idx           ON public.posts (status)`,
  `CREATE INDEX IF NOT EXISTS posts_company_status_idx   ON public.posts (company_id, status, scheduled_date DESC)`,
  `CREATE INDEX IF NOT EXISTS posts_platforms_idx        ON public.posts USING GIN (platforms)`,
  `CREATE INDEX IF NOT EXISTS posts_hashtags_idx         ON public.posts USING GIN (hashtags)`,

  // RLS
  `ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "Users read own posts"   ON public.posts`,
  `DROP POLICY IF EXISTS "Users insert own posts" ON public.posts`,
  `DROP POLICY IF EXISTS "Users update own posts" ON public.posts`,
  `DROP POLICY IF EXISTS "Users delete own posts" ON public.posts`,

  `CREATE POLICY "Users read own posts"
   ON public.posts FOR SELECT
   USING (auth.uid() = user_id)`,

  `CREATE POLICY "Users insert own posts"
   ON public.posts FOR INSERT
   WITH CHECK (auth.uid() = user_id)`,

  `CREATE POLICY "Users update own posts"
   ON public.posts FOR UPDATE
   USING (auth.uid() = user_id)
   WITH CHECK (auth.uid() = user_id)`,

  `CREATE POLICY "Users delete own posts"
   ON public.posts FOR DELETE
   USING (auth.uid() = user_id)`,

  // stats
  `ANALYZE public.posts`,
];

async function runQuery(query, token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Use GET' });
  }

  // Validate setup secret
  if (!SETUP_SECRET) {
    return res.status(503).json({ error: 'SETUP_SECRET not configured in Vercel env vars' });
  }
  if (req.query.secret !== SETUP_SECRET) {
    return res.status(403).json({ error: 'Wrong secret' });
  }

  // Get Supabase access token from query param
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({
      error: 'Missing ?token= parameter',
      howToGet: 'supabase.com → click your account icon (top right) → Account → Access Tokens → Generate new token',
      example: `/api/setup?secret=${SETUP_SECRET}&token=sbp_YOUR_TOKEN_HERE`,
    });
  }

  if (!PROJECT_REF) {
    return res.status(503).json({ error: 'VITE_SUPABASE_URL not configured — cannot determine project ref' });
  }

  const results = [];
  let failed = 0;

  for (const sql of MIGRATIONS) {
    const label = sql.trim().split('\n')[0].slice(0, 60);
    try {
      await runQuery(sql, token);
      results.push({ ok: true, sql: label });
    } catch (e) {
      // Ignore "already exists" errors — migrations are idempotent
      if (e.message.includes('already exists') || e.message.includes('duplicate')) {
        results.push({ ok: true, skipped: true, sql: label });
      } else {
        results.push({ ok: false, error: e.message, sql: label });
        failed++;
      }
    }
  }

  if (failed > 0) {
    return res.status(500).json({
      ok: false,
      message: `${failed} migration(s) failed`,
      results,
    });
  }

  return res.status(200).json({
    ok: true,
    message: '✅ Database setup complete! All tables and indexes created.',
    next: 'Go to your app and sign up with your email to create your account.',
    results,
  });
}
