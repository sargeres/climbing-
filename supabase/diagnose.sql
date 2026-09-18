-- ============================================================================
-- Sendlog crew diagnostics
--
-- For when the app reports "new row violates row-level security policy for
-- table comments" (or similar). Paste the whole file into the Supabase SQL
-- Editor and run it.
--
-- It writes nothing. The membership tests below really do attempt an insert,
-- as the member, through the same policies the app hits — but each attempt is
-- made inside a subtransaction that is always rolled back, so nothing is
-- stored either way. That is the point: the only way to know whether a policy
-- permits a write is to try it as the person it applies to.
--
-- Postgres reports the same sentence whichever half of a policy failed, so the
-- app cannot tell a missing policy from a lost membership. This can.
--
-- Members are tested per crew, against a post in their own crew. A member
-- cannot comment on another crew's post, and that refusal is the rules working
-- rather than a fault, so it is never reported as one.
-- ============================================================================

create or replace function pg_temp.sendlog_diagnose()
returns table (check_name text, result text)
language plpgsql
as $$
declare
  c        record;
  m        record;
  v_post   uuid;
  v_msg    text;
  v_count  int;
begin
  -- ---------------------------------------------------------------- policies
  select count(*) into v_count from pg_policies where schemaname = 'public';
  return query select 'policies installed (expect 10)', v_count::text;

  select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = 'comments';
  return query select 'policies on comments (expect 3)',
    case when v_count = 3 then '3 — correct'
         else v_count::text || ' — WRONG, re-run schema.sql' end;

  return query
    select 'comments policies present',
           coalesce((select string_agg(policyname, ', ' order by policyname)
                       from pg_policies
                      where schemaname = 'public' and tablename = 'comments'),
                    'NONE — this alone would cause the error');

  return query
    select 'comments_insert policy',
           coalesce((select 'present'
                       from pg_policies
                      where schemaname = 'public' and tablename = 'comments'
                        and policyname = 'comments_insert'),
                    'MISSING — this is the bug; re-run schema.sql');

  -- ------------------------------------------------------------------ tables
  return query
    select 'tables with RLS off (expect none)',
           coalesce((select string_agg(tablename, ', ')
                       from pg_tables
                      where schemaname = 'public'
                        and tablename in ('crews','crew_members','posts','comments')
                        and not rowsecurity),
                    'none — correct');

  -- -------------------------------------------------------------- membership
  -- Per crew, not globally. A member can only comment on posts in their OWN
  -- crew, so testing everyone against one crew's post reports every member of
  -- every other crew as a failure — correct RLS behaviour, read as a fault.
  for c in select cr.id, cr.name from public.crews cr order by cr.created_at
  loop
    select p.id into v_post
      from public.posts p
     where p.crew_id = c.id
     order by p.created_at desc
     limit 1;

    if v_post is null then
      return query select 'crew ' || c.name, 'no shared attempts yet — share one, then re-run';
      continue;
    end if;

    for m in select cm.display_name, cm.user_id
               from public.crew_members cm
              where cm.crew_id = c.id
              order by cm.joined_at
    loop
      begin
        perform set_config('request.jwt.claim.sub', m.user_id::text, true);
        execute 'set local role authenticated';

        begin
          insert into public.comments (post_id, author_name, body)
          values (v_post, m.display_name, 'diagnostic — never stored');
          -- Reaching here means the policy allowed it. Undo it regardless.
          raise exception 'sendlog_ok';
        exception
          when others then
            if sqlerrm = 'sendlog_ok' then v_msg := 'CAN comment';
            else v_msg := 'CANNOT comment — ' || sqlerrm;
            end if;
        end;

        execute 'reset role';
        return query select c.name || ' / ' || m.display_name, v_msg;
      end;
    end loop;
  end loop;
end;
$$;

select * from pg_temp.sendlog_diagnose();
