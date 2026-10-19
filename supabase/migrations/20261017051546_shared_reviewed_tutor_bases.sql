-- First shared tier: Literature only. No generation, billing, grades or user
-- notes in this cache. Second opinion remains independent and unchanged.
create table public.tutor_base_explanations (
 id uuid primary key default gen_random_uuid(),
 question_id text not null,
 question_version smallint not null,
 question_stem text not null,
 question_options jsonb not null,
 model text not null check(model='gemini-3.8-flash'),
 prompt_version text not null check(length(prompt_version) between 1 and 80),
 body text not null check(length(body) between 100 and 30000),
 sources jsonb not null check(jsonb_typeof(sources)='array' and jsonb_array_length(sources) between 1 and 12),
 citations jsonb not null default '[]' check(jsonb_typeof(citations)='array'),
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','published','withdrawn')),
 reviewer_id uuid references public.profiles(user_id),
 review_note text,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(question_id,question_version) references public.questions(id,version),
 check(status<>'published' or (reviewer_id is not null and reviewed_at is not null and length(trim(review_note))>=20))
);
create unique index tutor_one_published_base_idx on public.tutor_base_explanations(question_id,question_version,prompt_version) where status='published';
create index tutor_base_question_idx on public.tutor_base_explanations(question_id,question_version);
create index tutor_base_reviewer_idx on public.tutor_base_explanations(reviewer_id) where reviewer_id is not null;
alter table public.tutor_base_explanations enable row level security;
revoke all on public.tutor_base_explanations from public,anon,authenticated;
grant all on public.tutor_base_explanations to service_role;
grant select(id,question_id,question_version,model,prompt_version,body,citations,payload_sha256,reviewed_at) on public.tutor_base_explanations to authenticated;
create policy tutor_base_backend on public.tutor_base_explanations for all to service_role using(true) with check(true);

-- Invoker-only integrity check used by the privileged publisher and the narrow
-- private RLS authorization helper. No raw source text is returned.
create function egel_private.shared_base_sources_valid(p_sources jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select jsonb_typeof(p_sources)='array' and jsonb_array_length(p_sources) between 1 and 12
 and not exists (
   select 1 from jsonb_array_elements(p_sources) r
   left join public.library_documents d on d.id=r->>'document_id'
   left join public.library_chunks c on c.document_id=d.id and c.ordinal=(r->>'ordinal')::integer
   where d.id is null or c.document_id is null or d.visibility<>'common' or d.owner_id is not null
      or d.source_kind<>'literature' or not d.evidence_enabled or d.upload_state<>'verified'
      or c.body_sha256 is distinct from r->>'body_sha256'
      or c.pdf_page is distinct from (r->>'pdf_page')::integer
      or d.title is distinct from r->>'title'
      or d.catalog_id is distinct from r->>'catalog_id'
 );
$$;
revoke all on function egel_private.shared_base_sources_valid(jsonb) from public,anon,authenticated;
grant usage on schema egel_private to service_role;
grant execute on function egel_private.shared_base_sources_valid(jsonb) to service_role;

create function egel_private.stamp_shared_tutor_base() returns trigger
language plpgsql security invoker set search_path='' as $$
declare q public.questions; citations_value jsonb;
begin
 select * into strict q from public.questions where id=new.question_id and version=new.question_version;
 if tg_op='INSERT' then new.question_stem:=q.stem; new.question_options:=q.options; new.status:='draft'; end if;
 if new.status<>'withdrawn' and not egel_private.shared_base_sources_valid(new.sources) then raise exception 'BASE_SOURCES_INVALID' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object('document_id',r->>'document_id','catalog_id',r->>'catalog_id','title',r->>'title','pdf_page',(r->>'pdf_page')::integer) order by r->>'document_id',(r->>'pdf_page')::integer)
 into citations_value from jsonb_array_elements(new.sources) r;
 new.citations:=citations_value;
 new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.question_id,new.question_version,new.question_stem,new.question_options,new.model,new.prompt_version,new.body,new.sources)::text,'UTF8')),'hex');
 if tg_op='UPDATE' and new.payload_sha256<>old.payload_sha256 then new.status:='draft'; end if;
 if new.status='draft' then new.reviewer_id:=null; new.reviewed_at:=null; new.review_note:=null; end if;
 return new;
end; $$;
revoke all on function egel_private.stamp_shared_tutor_base() from public,anon,authenticated;
create trigger stamp_shared_tutor_base before insert or update on public.tutor_base_explanations for each row execute function egel_private.stamp_shared_tutor_base();

-- A SECURITY DEFINER is necessary ONLY here: students may read an approved
-- explanation, but must NOT gain SELECT on drafts or the raw library index.
-- This private helper authenticates the caller, checks their own saved attempt,
-- current question snapshot and source versions; it returns only a boolean.
create function egel_private.can_read_shared_tutor_base(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'
 and exists (
   select 1 from public.tutor_base_explanations b
   join public.questions q on q.id=b.question_id and q.version=b.question_version
   where b.id=p_id and b.status='published' and b.reviewed_at is not null
     and b.question_stem=q.stem and b.question_options=q.options
     and exists(select 1 from public.question_attempts a where a.user_id=(select auth.uid()) and a.question_id=b.question_id and a.question_version=b.question_version)
     and egel_private.shared_base_sources_valid(b.sources)
 );
$$;
revoke all on function egel_private.can_read_shared_tutor_base(uuid) from public,anon,authenticated;
grant execute on function egel_private.can_read_shared_tutor_base(uuid) to authenticated;
create policy tutor_base_read_reviewed_after_attempt on public.tutor_base_explanations for select to authenticated
 using(egel_private.can_read_shared_tutor_base(id));

create function public.publish_reviewed_tutor_base(p_id uuid,p_expected_hash text,p_reviewer uuid,p_review_note text,p_confirm_human_review boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b public.tutor_base_explanations; q public.questions;
begin
 if p_confirm_human_review is distinct from true or p_reviewer is null or p_review_note is null or length(trim(p_review_note))<20
   or not exists(select 1 from public.profiles where user_id=p_reviewer) then raise exception 'HUMAN_REVIEW_REQUIRED' using errcode='22023'; end if;
 select * into strict b from public.tutor_base_explanations where id=p_id for update;
 if b.status<>'draft' or b.payload_sha256 is distinct from p_expected_hash then raise exception 'BASE_REVIEW_CONFLICT' using errcode='40001'; end if;
 select * into strict q from public.questions where id=b.question_id and version=b.question_version;
 if b.question_stem<>q.stem or b.question_options<>q.options or not egel_private.shared_base_sources_valid(b.sources) then raise exception 'BASE_STALE' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b.question_id||':'||b.question_version||':'||b.prompt_version,0));
 update public.tutor_base_explanations set status='withdrawn' where question_id=b.question_id and question_version=b.question_version and prompt_version=b.prompt_version and status='published';
 update public.tutor_base_explanations set status='published',reviewer_id=p_reviewer,review_note=trim(p_review_note),reviewed_at=now() where id=p_id;
 return p_id;
end; $$;
revoke all on function public.publish_reviewed_tutor_base(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_reviewed_tutor_base(uuid,text,uuid,text,boolean) to service_role;

comment on table public.tutor_base_explanations is 'Human-reviewed shared Literature explanations, not an official answer key. No personal notes, choices, histories, grading or automatic model publication. Student reads require their own saved answer.';
notify pgrst,'reload schema';
