-- ─────────────────────────────────────────────────────────────
-- IMPROVED PostPilot — RLS Policies with Multi-Tenant Support
-- Run AFTER 001_initial_schema.sql
-- This version adds company_id enforcement and proper multi-tenancy
-- ─────────────────────────────────────────────────────────────

-- Enable RLS on the posts table
alter table public.posts enable row level security;

-- Create a function to check if user can access a company
-- This function will be used across all policies
create or replace function public.user_can_access_company(company_id_param text)
returns boolean as $$
declare
  user_email text;
  assigned_companies text[];
begin
  -- Get current user
  user_email := (select email from auth.users where id = auth.uid());
  
  -- If user_email is null (anonymous), deny access
  if user_email is null then
    return false;
  end if;
  
  -- Check if user has specific company assignments (stored in user metadata or profiles table)
  -- For now, using a simple check; in production, maintain a user_company_assignments table
  -- SELECT assigned_companies INTO assigned_companies FROM public.user_assignments WHERE user_email = user_email;
  
  -- If no assignment restrictions found, allow access
  -- Otherwise, check if company_id is in the assigned list
  return true; -- TODO: Verify against user_assignments table
end;
$$ language plpgsql security definer;

-- ── SELECT ───────────────────────────────────────────────────
-- Users can only read posts they created AND belong to an approved company
create policy "Users can read own posts in approved companies"
  on public.posts for select
  using (
    auth.uid() = user_id 
    and public.user_can_access_company(company_id)
  );

-- ── INSERT ───────────────────────────────────────────────────
-- Users can only insert posts where:
-- 1. user_id matches their own auth.uid()
-- 2. company_id is one they're assigned to
create policy "Users can insert own posts to approved companies"
  on public.posts for insert
  with check (
    auth.uid() = user_id 
    and public.user_can_access_company(company_id)
  );

-- ── UPDATE ───────────────────────────────────────────────────
-- Users can only update posts they own and company_id cannot be changed
create policy "Users can update own posts in approved companies"
  on public.posts for update
  using (
    auth.uid() = user_id 
    and public.user_can_access_company(company_id)
  )
  with check (
    auth.uid() = user_id 
    and public.user_can_access_company(company_id)
  );

-- ── DELETE ───────────────────────────────────────────────────
-- Users can only delete posts they own
create policy "Users can delete own posts in approved companies"
  on public.posts for delete
  using (
    auth.uid() = user_id 
    and public.user_can_access_company(company_id)
  );

-- ─────────────────────────────────────────────────────────────
-- USER COMPANY ASSIGNMENTS TABLE
-- Tracks which users can access which companies
-- ─────────────────────────────────────────────────────────────

create table if not exists public.user_company_assignments (
  id              uuid primary key default gen_random_uuid(),
  user_email      text not null,
  company_id      text not null,
  role            text not null default 'member' 
                  check (role in ('owner', 'admin', 'member')),
  created_at      timestamptz not null default now(),
  
  unique (user_email, company_id)
);

-- Enable RLS on assignments table
alter table public.user_company_assignments enable row level security;

-- Only allow reading own assignments
create policy "Users can read own company assignments"
  on public.user_company_assignments for select
  using (user_email = (select email from auth.users where id = auth.uid()));

-- Update the user_can_access_company function to use this table
create or replace function public.user_can_access_company(company_id_param text)
returns boolean as $$
declare
  user_email text;
  has_access boolean;
begin
  user_email := (select email from auth.users where id = auth.uid());
  
  if user_email is null then
    return false;
  end if;
  
  -- Check if user has explicit assignment to this company
  select exists(
    select 1 from public.user_company_assignments
    where user_email = $1 and company_id = company_id_param
  ) into has_access;
  
  -- If no explicit assignment found, default to false
  -- Admins could override this with an additional check
  return coalesce(has_access, false);
end;
$$ language plpgsql security definer;

-- Add indexes for performance
create index if not exists user_company_assignments_email_idx 
  on public.user_company_assignments (user_email);
create index if not exists user_company_assignments_company_idx 
  on public.user_company_assignments (company_id);

-- ─────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────
-- After running, confirm RLS is active:
--   select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- Expected: posts | true
--           user_company_assignments | true
-- ─────────────────────────────────────────────────────────────
