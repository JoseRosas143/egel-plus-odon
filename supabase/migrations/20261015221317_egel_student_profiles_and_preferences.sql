-- EGEL: initial private student data. No academic content or credentials.
create schema egel_private;
revoke all on schema egel_private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Estudiante' check (char_length(btrim(display_name)) between 1 and 100),
  timezone text not null default 'America/Mexico_City' check (char_length(timezone) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.study_preferences (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  daily_goal_minutes smallint not null default 20 check (daily_goal_minutes between 5 and 240),
  exam_date date,
  preferred_mode text not null default 'sequential' check (preferred_mode in ('sequential','random','review')),
  theme text not null default 'system' check (theme in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.study_preferences enable row level security;
revoke all on table public.profiles, public.study_preferences from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles, public.study_preferences to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
grant update (daily_goal_minutes, exam_date, preferred_mode, theme) on public.study_preferences to authenticated;
grant select, insert, update, delete on table public.profiles, public.study_preferences to service_role;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false')
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy preferences_select_own on public.study_preferences for select to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');
create policy preferences_update_own on public.study_preferences for update to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false')
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') = 'false');

create function egel_private.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
revoke all on function egel_private.touch_updated_at() from public, anon, authenticated;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function egel_private.touch_updated_at();
create trigger preferences_touch_updated_at before update on public.study_preferences
for each row execute function egel_private.touch_updated_at();

-- This function is only for the auth.users INSERT trigger, not an API/RPC.
-- No auth.uid() exists during GoTrue signup; NEW.id is the authoritative ID.
-- User-editable metadata is used for a display label only, never permissions.
create function egel_private.create_student_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' or tg_op <> 'INSERT' then
    raise exception 'Invalid invocation of student profile trigger';
  end if;
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(nullif(left(btrim(new.raw_user_meta_data->>'display_name'),100),''),'Estudiante'));
  insert into public.study_preferences(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function egel_private.create_student_profile() from public, anon, authenticated;
create trigger egel_on_auth_user_created after insert on auth.users
for each row execute function egel_private.create_student_profile();

comment on table public.profiles is 'Private student profile; ownership is auth.users.id. No client-editable authorization role.';
comment on table public.study_preferences is 'Private study preferences. Only owner-editable non-security fields are granted to authenticated.';
comment on schema egel_private is 'Internal trigger functions only. Not for the Data API; no client schema usage granted.';
notify pgrst, 'reload schema';
