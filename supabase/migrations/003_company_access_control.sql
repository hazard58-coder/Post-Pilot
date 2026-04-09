-- ─────────────────────────────────────────────────────────────
-- PostPilot — Company Access Control
-- Run AFTER 001_initial_schema.sql and BEFORE 002_rls_policies.sql
-- ─────────────────────────────────────────────────────────────

-- Companies table for proper company management
create table if not exists public.companies (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  industry    text        not null default '',
  color       text        not null default '#6366f1',
  initials    text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- User-company assignments for access control
create table if not exists public.user_company_assignments (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  company_id  uuid        not null references public.companies(id) on delete cascade,
  role        text        not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  unique(user_id, company_id)
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- Indexes
create index if not exists user_company_assignments_user_id_idx on public.user_company_assignments (user_id);
create index if not exists user_company_assignments_company_id_idx on public.user_company_assignments (company_id);