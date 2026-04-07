-- ─────────────────────────────────────────────────────────────
-- PostPilot — Row Level Security Policies
-- Run AFTER 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────

-- Enable RLS on the posts table
alter table public.posts enable row level security;

-- ── SELECT ───────────────────────────────────────────────────
-- Users can only read their own posts.
-- Admins (service_role key) bypass RLS automatically.
create policy "Users can read own posts"
  on public.posts for select
  using ( auth.uid() = user_id );

-- ── INSERT ───────────────────────────────────────────────────
-- Users can only insert rows where user_id matches their auth identity.
create policy "Users can insert own posts"
  on public.posts for insert
  with check ( auth.uid() = user_id );

-- ── UPDATE ───────────────────────────────────────────────────
-- Users can only update rows they own.
create policy "Users can update own posts"
  on public.posts for update
  using  ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );

-- ── DELETE ───────────────────────────────────────────────────
-- Users can only delete rows they own.
create policy "Users can delete own posts"
  on public.posts for delete
  using ( auth.uid() = user_id );

-- ─────────────────────────────────────────────────────────────
-- VERIFICATION
-- After running, confirm RLS is active:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- Expected: posts | true
-- ─────────────────────────────────────────────────────────────
