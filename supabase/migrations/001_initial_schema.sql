-- ─────────────────────────────────────────────────────────────
-- PostPilot — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- posts table
create table if not exists public.posts (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  company_id     uuid        not null default gen_random_uuid(),
  content        text        not null default '',
  platforms      text[]      not null default '{}',
  post_type      text        not null default 'Post',
  category       text        not null default '',
  hashtags       text[]      not null default '{}',
  status         text        not null default 'scheduled'
                             check (status in ('scheduled','draft','published','failed')),
  scheduled_date timestamptz not null,
  engagement     jsonb       not null default '{}',
  media_urls     text[]      not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- Indexes for common query patterns
create index if not exists posts_user_id_idx          on public.posts (user_id);
create index if not exists posts_company_id_idx       on public.posts (company_id);
create index if not exists posts_scheduled_date_idx   on public.posts (scheduled_date asc);
create index if not exists posts_status_idx           on public.posts (status);
