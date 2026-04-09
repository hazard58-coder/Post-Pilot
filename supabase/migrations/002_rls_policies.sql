-- ─────────────────────────────────────────────────────────────
-- PostPilot — Row Level Security Policies
-- Run AFTER 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────

-- Enable RLS on the posts table
alter table public.posts enable row level security;

-- ── SELECT ───────────────────────────────────────────────────
-- Users can only read posts from companies they are assigned to.
create policy "Users can read posts from assigned companies"
  on public.posts for select
  using (
    auth.uid() = user_id AND
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

-- ── INSERT ───────────────────────────────────────────────────
-- Users can only insert posts for companies they are assigned to.
create policy "Users can insert posts for assigned companies"
  on public.posts for insert
  with check (
    auth.uid() = user_id AND
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

-- ── UPDATE ───────────────────────────────────────────────────
-- Users can only update posts they own in companies they are assigned to.
create policy "Users can update own posts in assigned companies"
  on public.posts for update
  using (
    auth.uid() = user_id AND
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id AND
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

-- ── DELETE ───────────────────────────────────────────────────
-- Users can only delete posts they own in companies they are assigned to.
create policy "Users can delete own posts in assigned companies"
  on public.posts for delete
  using (
    auth.uid() = user_id AND
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

-- ── COMPANIES TABLE POLICIES ─────────────────────────────────
-- Enable RLS on companies
alter table public.companies enable row level security;

-- Users can read companies they are assigned to
create policy "Users can read assigned companies"
  on public.companies for select
  using (
    id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid()
    )
  );

-- Only owners/admins can modify companies (simplified - in production, add proper checks)
create policy "Company owners/admins can modify companies"
  on public.companies for all
  using (
    id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── USER COMPANY ASSIGNMENTS POLICIES ────────────────────────
-- Enable RLS on user_company_assignments
alter table public.user_company_assignments enable row level security;

-- Users can read their own assignments
create policy "Users can read own company assignments"
  on public.user_company_assignments for select
  using (user_id = auth.uid());

-- Only owners/admins can manage assignments (simplified)
create policy "Company owners/admins can manage assignments"
  on public.user_company_assignments for all
  using (
    company_id IN (
      SELECT company_id FROM public.user_company_assignments
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- VERIFICATION
-- After running, confirm RLS is active:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- Expected: posts | true
-- ─────────────────────────────────────────────────────────────
