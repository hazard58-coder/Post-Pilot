// ─────────────────────────────────────────────────────────────
// ONE-TIME DATABASE SETUP ENDPOINT
//
// This runs all your database migrations automatically.
// You call it ONCE after deploying, then it's done forever.
//
// How to use:
//   1. Add DATABASE_URL and SETUP_SECRET to Vercel env vars (see README)
//   2. Visit: https://your-app.vercel.app/api/setup?secret=YOUR_SECRET
//   3. See "Setup complete!" — your database is ready
//
// DATABASE_URL comes from Supabase:
//   Project Settings → Database → Connection string → URI (Session mode)
//   It looks like: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
// ─────────────────────────────────────────────────────────────

import { Client } from 'pg';

const SETUP_SECRET  = process.env.SETUP_SECRET  || '';
const DATABASE_URL  = process.env.DATABASE_URL   || '';

// All migrations in order, combined into one idempotent script.
// Every statement uses IF NOT EXISTS / CREATE OR REPLACE so it's
// safe to run multiple times — it will never break a working database.
const MIGRATIONS = `
-- ── TABLE: posts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
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
);

-- ── TABLE: companies ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  industry   text        NOT NULL DEFAULT '',
  color      text        NOT NULL DEFAULT '#3B82F6',
  initials   text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── TABLE: user_company_assignments ──────────────────────────
CREATE TABLE IF NOT EXISTS public.user_company_assignments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role       text        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

-- ── AUTO-UPDATE updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_set_updated_at ON public.posts;
CREATE TRIGGER posts_set_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── INDEXES ───────────────────────────────────────────────────
-- (no CONCURRENTLY — that requires running outside a transaction)
CREATE INDEX IF NOT EXISTS posts_user_id_idx
  ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS posts_company_id_idx
  ON public.posts (company_id);
CREATE INDEX IF NOT EXISTS posts_scheduled_date_idx
  ON public.posts (scheduled_date ASC);
CREATE INDEX IF NOT EXISTS posts_status_idx
  ON public.posts (status);
CREATE INDEX IF NOT EXISTS posts_company_status_scheduled_idx
  ON public.posts (company_id, status, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS posts_platforms_idx
  ON public.posts USING GIN (platforms);
CREATE INDEX IF NOT EXISTS posts_hashtags_idx
  ON public.posts USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS user_company_assignments_user_idx
  ON public.user_company_assignments (user_id);
CREATE INDEX IF NOT EXISTS user_company_assignments_company_idx
  ON public.user_company_assignments (company_id);

-- ── ROW LEVEL SECURITY: posts ─────────────────────────────────
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company posts"     ON public.posts;
DROP POLICY IF EXISTS "Users can insert own company posts"   ON public.posts;
DROP POLICY IF EXISTS "Users can update own company posts"   ON public.posts;
DROP POLICY IF EXISTS "Users can delete own company posts"   ON public.posts;

CREATE POLICY "Users can read own company posts"
  ON public.posts FOR SELECT
  USING (
    auth.uid() = user_id
    AND company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own company posts"
  ON public.posts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own company posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own company posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id);

-- ── ROW LEVEL SECURITY: companies ────────────────────────────
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read assigned companies"   ON public.companies;
DROP POLICY IF EXISTS "Owners can manage companies"         ON public.companies;

CREATE POLICY "Users can read assigned companies"
  ON public.companies FOR SELECT
  USING (
    id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage companies"
  ON public.companies FOR ALL
  USING (
    id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── ROW LEVEL SECURITY: user_company_assignments ─────────────
ALTER TABLE public.user_company_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own assignments"      ON public.user_company_assignments;
DROP POLICY IF EXISTS "Owners can manage assignments"        ON public.user_company_assignments;

CREATE POLICY "Users can read own assignments"
  ON public.user_company_assignments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Owners can manage assignments"
  ON public.user_company_assignments FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── STATISTICS ────────────────────────────────────────────────
ANALYZE public.posts;
`;

export default async function handler(req, res) {
  // Only GET requests (easy to call from a browser)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Use GET to call this endpoint' });
  }

  // Require the secret so random people can't run this
  if (!SETUP_SECRET) {
    return res.status(503).json({
      error: 'SETUP_SECRET env var not set in Vercel. Add it first.',
    });
  }
  if (req.query.secret !== SETUP_SECRET) {
    return res.status(403).json({ error: 'Wrong secret. Check your SETUP_SECRET env var.' });
  }

  // Require the database URL
  if (!DATABASE_URL) {
    return res.status(503).json({
      error: 'DATABASE_URL env var not set. Get it from Supabase → Project Settings → Database → Connection String (URI mode).',
    });
  }

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // required for Supabase
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();
    await client.query(MIGRATIONS);

    return res.status(200).json({
      ok: true,
      message: '✅ Setup complete! Your database is ready. You can now sign up and use PostPilot.',
      next: 'Delete SETUP_SECRET and DATABASE_URL from Vercel env vars, then redeploy to lock this endpoint.',
    });
  } catch (e) {
    console.error('[setup] Migration failed:', e.message);
    return res.status(500).json({
      error: 'Migration failed',
      detail: e.message,
      hint: 'Check that DATABASE_URL is the full connection string from Supabase (URI mode, not pooler).',
    });
  } finally {
    await client.end().catch(() => {});
  }
}
