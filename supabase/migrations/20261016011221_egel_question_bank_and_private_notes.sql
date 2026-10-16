-- Counterpart of the remote migration 20261016011221, already applied to Egel.
-- Formatting/comments retained for review; do not run twice. Operator membership is not exported.
-- Bank content is NOT evidence and has no validated answer key.
create table public.question_banks (
 id text primary key, title text not null,
 source_file_sha256 text not null, import_sha256 text not null,
 expected_count integer not null check (expected_count between 1 and 2000),
 created_at timestamptz not null default now()
);
create table public.questions (
 id text primary key, bank_id text not null references public.question_banks(id),
 position smallint not null check(position > 0), version smallint not null default 1 check(version > 0),
 source_number integer not null, stem text not null check(char_length(stem) between 1 and 20000),
 options jsonb not null check(jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 3),
 source_pages jsonb not null, review_flags jsonb not null default '[]',
 evidence_eligible boolean not null default false check(not evidence_eligible),
 scoreable boolean not null default false check(not scoreable),
 original_record jsonb not null,
 unique(bank_id,position), unique(id,version)
);
create table public.study_notes (
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 question_id text not null, question_version smallint not null default 1,
 general_note text not null default '' check(char_length(general_note)<=10000),
 note_a text not null default '' check(char_length(note_a)<=5000),
 note_b text not null default '' check(char_length(note_b)<=5000),
 note_c text not null default '' check(char_length(note_c)<=5000),
 personal_verdict text check(personal_verdict in ('A','B','C')),
 favorite boolean not null default false,
 highlights jsonb not null default '[]' check(jsonb_typeof(highlights)='array' and jsonb_array_length(highlights)<=50 and octet_length(highlights::text)<=40000),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(user_id,question_id,question_version),
 foreign key(question_id,question_version) references public.questions(id,version)
);
create table public.question_attempts (
 user_id uuid not null references public.profiles(user_id) on delete cascade,
 request_id uuid not null, question_id text not null, question_version smallint not null default 1,
 selected_answer text not null check(selected_answer in ('A','B','C')),
 created_at timestamptz not null default now(),
 primary key(user_id,request_id),
 foreign key(question_id,question_version) references public.questions(id,version)
);
create table public.study_positions (
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 question_id text not null, question_version smallint not null default 1,
 updated_at timestamptz not null default now(),
 foreign key(question_id,question_version) references public.questions(id,version)
);
create index notes_question_idx on public.study_notes(question_id,question_version);
create index notes_recent_idx on public.study_notes(user_id,updated_at desc);
create index attempts_question_idx on public.question_attempts(question_id,question_version);
create index attempts_recent_idx on public.question_attempts(user_id,question_id,created_at desc);
create index positions_question_idx on public.study_positions(question_id,question_version);

alter table public.question_banks enable row level security;
alter table public.questions enable row level security;
alter table public.study_notes enable row level security;
alter table public.question_attempts enable row level security;
alter table public.study_positions enable row level security;
revoke all on public.question_banks,public.questions,public.study_notes,public.question_attempts,public.study_positions from public,anon,authenticated;
grant select on public.question_banks,public.questions,public.study_notes,public.question_attempts,public.study_positions to authenticated;
grant insert(user_id,question_id,question_version,general_note,note_a,note_b,note_c,personal_verdict,favorite,highlights) on public.study_notes to authenticated;
grant update(general_note,note_a,note_b,note_c,personal_verdict,favorite,highlights) on public.study_notes to authenticated;
grant delete on public.study_notes to authenticated;
grant insert(user_id,request_id,question_id,question_version,selected_answer) on public.question_attempts to authenticated;
grant insert(user_id,question_id,question_version) on public.study_positions to authenticated;
grant update(question_id,question_version) on public.study_positions to authenticated;
grant all on public.question_banks,public.questions,public.study_notes,public.question_attempts,public.study_positions to service_role;
create policy banks_read_signed_in on public.question_banks for select to authenticated using ((select auth.uid()) is not null and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy questions_read_signed_in on public.questions for select to authenticated using ((select auth.uid()) is not null and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy notes_read_own on public.study_notes for select to authenticated using((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy notes_insert_own on public.study_notes for insert to authenticated with check((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy notes_update_own on public.study_notes for update to authenticated using((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') with check((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy notes_delete_own on public.study_notes for delete to authenticated using((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy attempts_read_own on public.question_attempts for select to authenticated using((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy attempts_insert_own on public.question_attempts for insert to authenticated with check((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy positions_read_own on public.study_positions for select to authenticated using((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy positions_insert_own on public.study_positions for insert to authenticated with check((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create policy positions_update_own on public.study_positions for update to authenticated using((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false') with check((select auth.uid())=user_id and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false');
create function egel_private.note_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=old.revision+1; new.updated_at:=statement_timestamp(); return new; end; $$;
revoke all on function egel_private.note_revision() from public,anon,authenticated;
create trigger notes_revision before update on public.study_notes for each row execute function egel_private.note_revision();
create trigger positions_touch before update on public.study_positions for each row execute function egel_private.touch_updated_at();

-- Narrow permission: import precisely the approved, hashed staging file. Not a general admin role.
create table egel_private.bank_import_permissions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default now()
);
alter table egel_private.bank_import_permissions enable row level security;
revoke all on egel_private.bank_import_permissions from public,anon,authenticated;
create function egel_private.can_import_bank() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false')='false' and exists(select 1 from egel_private.bank_import_permissions p where p.user_id=auth.uid());
$$;
revoke all on function egel_private.can_import_bank() from public,anon,authenticated;
grant usage on schema egel_private to authenticated;
grant execute on function egel_private.can_import_bank() to authenticated;
create function public.egel_can_import_bank() returns boolean language sql stable security invoker set search_path='' as $$ select egel_private.can_import_bank(); $$;
revoke all on function public.egel_can_import_bank() from public,anon;
grant execute on function public.egel_can_import_bank() to authenticated;
create function egel_private.import_bank_v1(p_source text) returns jsonb language plpgsql security definer set search_path='' as $$
declare payload jsonb; existing_hash text; n integer;
begin
 if auth.uid() is null or not egel_private.can_import_bank() then raise insufficient_privilege; end if;
 if p_source is null or octet_length(p_source)>2000000 or encode(sha256(convert_to(p_source,'UTF8')),'hex')<>'d357368c555c23feb647af67156a534d6277185a95cfb2d1ae3fdf6d7fc4d62c' then
  raise exception 'BANK_FILE_MISMATCH' using errcode='22023';
 end if;
 payload:=p_source::jsonb;
 if jsonb_typeof(payload)<>'array' or jsonb_array_length(payload)<>469 then raise exception 'BANK_FILE_MISMATCH' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(718621413);
 select import_sha256 into existing_hash from public.question_banks where id='BANK-001';
 if found then
  select count(*) into n from public.questions where bank_id='BANK-001';
  if existing_hash<>'d357368c555c23feb647af67156a534d6277185a95cfb2d1ae3fdf6d7fc4d62c' or n<>469 then raise exception 'BANK_CONFLICT' using errcode='23505'; end if;
  return jsonb_build_object('ok',true,'count',n,'already_imported',true);
 end if;
 insert into public.question_banks(id,title,source_file_sha256,import_sha256,expected_count) values('BANK-001','Guia de preguntas EGEL Odontologia 2026 - banco de practica','16b5aff4b35dd7bb1f9a18a68b7a7bfdd5644865ad9826fa698ac56fe6f97b94','d357368c555c23feb647af67156a534d6277185a95cfb2d1ae3fdf6d7fc4d62c',469);
 insert into public.questions(id,bank_id,position,source_number,stem,options,source_pages,review_flags,original_record)
 select r->>'id',r->>'bank_id',(r->>'order')::smallint,(r->>'original_source_number')::integer,r->>'stem_text',r->'options',r->'source_pdf_pages',r->'review_flags',r from jsonb_array_elements(payload) as r;
 get diagnostics n=row_count;
 return jsonb_build_object('ok',true,'count',n,'already_imported',false);
end; $$;
revoke all on function egel_private.import_bank_v1(text) from public,anon,authenticated;
grant execute on function egel_private.import_bank_v1(text) to authenticated;
create function public.egel_import_bank_v1(p_source text) returns jsonb language sql security invoker set search_path='' as $$ select egel_private.import_bank_v1(p_source); $$;
revoke all on function public.egel_import_bank_v1(text) from public,anon;
grant execute on function public.egel_import_bank_v1(text) to authenticated;
comment on table public.questions is 'Exercises only, not academic evidence. No validated answer key; no scoring. Immutable from student clients.';
comment on table public.study_notes is 'Private notes and personal verdict, not a medically validated answer. Anchored to question version; revision for optimistic concurrency.';
notify pgrst,'reload schema';
