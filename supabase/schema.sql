-- ============================================================================
-- Sendlog crew schema
--
-- Run this ONCE in the Supabase SQL Editor (Dashboard -> SQL Editor -> New
-- query -> paste -> Run). It is written to be re-runnable: running it a second
-- time will not destroy anything.
--
-- SECURITY MODEL
-- The app ships a publishable key, which is public by design, so every rule
-- that matters is enforced here by Row Level Security. The shape is:
--
--   * Every device signs in anonymously and gets its own auth.uid().
--   * A crew is joined with a secret join code, never by knowing its id.
--     Joining happens through join_crew(), a SECURITY DEFINER function, so the
--     crews table itself never needs to be readable by non-members. Without a
--     code you cannot discover that a crew exists, let alone read it.
--   * Everything else is gated on "are you a member of this crew".
--
-- The membership test is itself SECURITY DEFINER. That is deliberate: a policy
-- on crew_members that queried crew_members would recurse.
-- ============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tables --
create table if not exists public.crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  -- The secret. Whoever holds this can join, so it is generated long and random.
  join_code   text not null unique,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.crew_members (
  crew_id      uuid not null references public.crews(id) on delete cascade,
  user_id      uuid not null default auth.uid(),
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  joined_at    timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  crew_id      uuid not null references public.crews(id) on delete cascade,
  user_id      uuid not null default auth.uid(),
  -- Denormalised so the feed is a single query and stays readable even if the
  -- poster later changes their display name.
  author_name  text not null,
  climber_name text,
  venue        text,
  grade        text not null,
  problem_name text not null default '',
  completion   int  not null check (completion between 0 and 100),
  effort       int  not null check (effort between 1 and 10),
  climb_sec    int  not null default 0,
  rest_sec     int  not null default 0,
  video_url    text not null default '',
  -- Stable id of the attempt in the poster's local log, so re-sharing the same
  -- attempt updates the post instead of duplicating it.
  local_id     text not null,
  climbed_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (user_id, local_id)
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null default auth.uid(),
  author_name text not null,
  body        text not null check (length(trim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index if not exists posts_crew_created_idx on public.posts (crew_id, created_at desc);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at);
create index if not exists crew_members_user_idx on public.crew_members (user_id);

-- --------------------------------------------------------------- functions --

-- SECURITY DEFINER so a policy on crew_members can call it without recursing
-- into the very table it is protecting.
create or replace function public.is_crew_member(p_crew uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.crew_members
    where crew_id = p_crew and user_id = auth.uid()
  );
$$;

-- The only way into a crew. Takes the secret code rather than the crew id, so
-- crews never need to be readable by outsiders.
create or replace function public.join_crew(p_code text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crew uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'display name required';
  end if;

  select id into v_crew from public.crews where join_code = trim(p_code);
  if v_crew is null then
    raise exception 'no crew with that code';
  end if;

  insert into public.crew_members (crew_id, user_id, display_name)
  values (v_crew, auth.uid(), trim(p_name))
  on conflict (crew_id, user_id)
    do update set display_name = excluded.display_name;

  return v_crew;
end;
$$;

-- Creating a crew and joining it must happen together, or a failure between
-- the two would leave a crew nobody can reach.
create or replace function public.create_crew(p_name text, p_display_name text)
returns table (id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_crew uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- 32 hex chars: not guessable, and still fine in a URL.
  v_code := encode(gen_random_bytes(16), 'hex');

  insert into public.crews (name, join_code)
  values (trim(p_name), v_code)
  returning crews.id into v_crew;

  insert into public.crew_members (crew_id, user_id, display_name)
  values (v_crew, auth.uid(), trim(p_display_name));

  return query select v_crew, v_code;
end;
$$;

grant execute on function public.join_crew(text, text) to anon, authenticated;
grant execute on function public.create_crew(text, text) to anon, authenticated;
grant execute on function public.is_crew_member(uuid) to anon, authenticated;

-- -------------------------------------------------------------------- RLS --
alter table public.crews        enable row level security;
alter table public.crew_members enable row level security;
alter table public.posts        enable row level security;
alter table public.comments     enable row level security;

drop policy if exists crews_select on public.crews;
create policy crews_select on public.crews
  for select using (public.is_crew_member(id));

-- No insert/update/delete policies on crews at all: creation goes through
-- create_crew(), so there is no path for a client to write this table directly.

drop policy if exists members_select on public.crew_members;
create policy members_select on public.crew_members
  for select using (public.is_crew_member(crew_id));

drop policy if exists members_delete_self on public.crew_members;
create policy members_delete_self on public.crew_members
  for delete using (user_id = auth.uid());

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select using (public.is_crew_member(crew_id));

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert with check (user_id = auth.uid() and public.is_crew_member(crew_id));

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete using (user_id = auth.uid());

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_crew_member(p.crew_id)
    )
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts p
      where p.id = post_id and public.is_crew_member(p.crew_id)
    )
  );

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own on public.comments
  for delete using (user_id = auth.uid());
