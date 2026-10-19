-- Additive: no book uploads, data imports, approvals, publication or AI calls.
-- Filename matches the version recorded by the remote migration service.
-- Reviewed excerpts are a separate evidence tier, NOT permission to use the
-- whole unreviewed OCR index. Raw text remains backend-only.
create function egel_private.library_shared_document_fingerprint(p_document text)
returns text language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(d.id,d.original_sha256,d.title,
   d.catalog_id,d.page_count,d.source_kind,d.visibility,d.owner_id,d.upload_state)::text,'UTF8')),'hex')
 from public.library_documents d where d.id=p_document and d.visibility='common'
 and d.owner_id is null and d.source_kind='literature' and d.upload_state='verified';
$$;
revoke all on function egel_private.library_shared_document_fingerprint(text) from public,anon,authenticated;
grant execute on function egel_private.library_shared_document_fingerprint(text) to service_role;

create table public.library_reviewed_transcriptions (
 id uuid primary key default gen_random_uuid(),
 document_id text not null references public.library_documents(id),
 pdf_page integer not null check(pdf_page>0),
 body text not null check(length(body) between 100 and 8000),
 body_sha256 text not null check(body_sha256 ~ '^[a-f0-9]{64}$'),
 source_locator text not null check(length(trim(source_locator)) between 1 and 500),
 revision_note text not null check(length(trim(revision_note)) between 20 and 2000),
 document_fingerprint text not null check(document_fingerprint ~ '^[a-f0-9]{64}$'),
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','approved','revoked')),
 reviewer_id uuid references public.profiles(user_id),
 review_note text,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 check(status<>'approved' or (reviewer_id is not null and reviewed_at is not null
   and review_note is not null and length(trim(review_note))>=20))
);
create index reviewed_transcriptions_document_idx on public.library_reviewed_transcriptions(document_id,pdf_page);
create index reviewed_transcriptions_reviewer_idx on public.library_reviewed_transcriptions(reviewer_id) where reviewer_id is not null;
alter table public.library_reviewed_transcriptions enable row level security;
revoke all on public.library_reviewed_transcriptions from public,anon,authenticated;
grant select,insert,update,delete on public.library_reviewed_transcriptions to service_role;
create policy reviewed_transcriptions_backend_only on public.library_reviewed_transcriptions
 for all to service_role using(true) with check(true);

create function egel_private.stamp_library_transcription() returns trigger
language plpgsql security invoker set search_path='' as $$
declare doc_fingerprint text; page_limit integer;
begin
 -- Withdrawal must still be possible after its parent document became stale.
 if tg_op='UPDATE' and new.status='revoked' and
   row(new.document_id,new.pdf_page,new.body,new.source_locator,new.revision_note) is not distinct from
   row(old.document_id,old.pdf_page,old.body,old.source_locator,old.revision_note) then
   new.document_fingerprint:=old.document_fingerprint; new.body_sha256:=old.body_sha256;
   new.payload_sha256:=old.payload_sha256; new.reviewer_id:=old.reviewer_id;
   new.reviewed_at:=old.reviewed_at; new.review_note:=old.review_note;
   return new;
 end if;
 doc_fingerprint:=egel_private.library_shared_document_fingerprint(new.document_id);
 select page_count into page_limit from public.library_documents where id=new.document_id;
 if doc_fingerprint is null or new.pdf_page>page_limit then
   raise exception 'TRANSCRIPTION_DOCUMENT_INVALID' using errcode='22023';
 end if;
 new.document_fingerprint:=doc_fingerprint;
 new.body_sha256:=encode(sha256(convert_to(new.body,'UTF8')),'hex');
 new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.document_id,new.pdf_page,
   new.body,new.source_locator,new.revision_note,new.document_fingerprint)::text,'UTF8')),'hex');
 if tg_op='INSERT' then new.status:='draft';
 elsif new.payload_sha256 is distinct from old.payload_sha256 then new.status:='draft'; end if;
 if new.status='draft' then new.reviewer_id:=null; new.reviewed_at:=null; new.review_note:=null; end if;
 return new;
end; $$;
revoke all on function egel_private.stamp_library_transcription() from public,anon,authenticated;
create trigger stamp_library_transcription before insert or update on public.library_reviewed_transcriptions
 for each row execute function egel_private.stamp_library_transcription();

create function public.approve_reviewed_library_transcription(p_id uuid,p_expected_hash text,
 p_reviewer uuid,p_review_note text,p_confirm_human_review boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.library_reviewed_transcriptions;
begin
 if p_confirm_human_review is distinct from true or p_reviewer is null or p_review_note is null
   or length(trim(p_review_note))<20 or not exists(select 1 from public.profiles where user_id=p_reviewer)
 then raise exception 'HUMAN_REVIEW_REQUIRED' using errcode='22023'; end if;
 select * into strict t from public.library_reviewed_transcriptions where id=p_id for update;
 if t.status<>'draft' or t.payload_sha256 is distinct from p_expected_hash then
   raise exception 'TRANSCRIPTION_REVIEW_CONFLICT' using errcode='40001'; end if;
 if t.document_fingerprint is distinct from egel_private.library_shared_document_fingerprint(t.document_id) then
   raise exception 'TRANSCRIPTION_STALE' using errcode='22023'; end if;
 update public.library_reviewed_transcriptions set status='approved',reviewer_id=p_reviewer,
   review_note=trim(p_review_note),reviewed_at=now() where id=p_id;
 return p_id;
end; $$;
revoke all on function public.approve_reviewed_library_transcription(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.approve_reviewed_library_transcription(uuid,text,uuid,text,boolean) to service_role;

alter table public.tutor_base_explanations add column editorial_revision boolean not null default false,
 add column provenance jsonb not null default '{}';
alter table public.tutor_base_explanations drop constraint tutor_base_explanations_model_check;
alter table public.tutor_base_explanations add constraint tutor_base_model_and_provenance_check check((
 (model='gemini-3.8-flash' and prompt_version='literature-base-v1' and not editorial_revision and provenance='{}'::jsonb)
 or (model='deepseek-flash' and prompt_version='literature-editorial-v1' and editorial_revision
   and jsonb_typeof(provenance)='object' and provenance->>'provider'='deepseek'
   and provenance->>'generation_prompt_version'='literature-draft-v2'
   and provenance->>'run_fingerprint' ~ '^[a-f0-9]{64}$'
   and provenance->>'draft_markdown_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'editorial_document_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'editorial_approval_sha256' ~ '^[a-f0-9]{64}$')
) is true);
alter table public.tutor_base_explanations add constraint tutor_base_published_review_complete
 check(status<>'published' or (reviewer_id is not null and reviewed_at is not null
   and review_note is not null and length(trim(review_note))>=20));
grant select(editorial_revision) on public.tutor_base_explanations to authenticated;

-- Malformed or stale sources deny access rather than throwing casts during RLS.
create or replace function egel_private.shared_base_sources_valid(p_sources jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare r jsonb; d public.library_documents; t public.library_reviewed_transcriptions; page_number integer; ordinal_number integer;
begin
 if jsonb_typeof(p_sources) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_sources) not between 1 and 12 then return false; end if;
 for r in select value from jsonb_array_elements(p_sources) loop
   if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'pdf_page') is distinct from 'number'
     or coalesce(r->>'pdf_page','') !~ '^[1-9][0-9]*$'
     or coalesce(r->>'body_sha256','') !~ '^[a-f0-9]{64}$' then return false; end if;
   page_number:=(r->>'pdf_page')::integer;
   select * into d from public.library_documents where id=r->>'document_id';
   if not found then return false; end if;
   if d.visibility<>'common' or d.owner_id is not null or d.source_kind<>'literature' or d.upload_state<>'verified'
     or page_number>d.page_count or d.title is distinct from r->>'title'
     or d.catalog_id is distinct from r->>'catalog_id' then return false; end if;
   if coalesce(r->>'kind','chunk')='chunk' then
     if not d.evidence_enabled or jsonb_typeof(r->'ordinal') is distinct from 'number'
       or coalesce(r->>'ordinal','') !~ '^[0-9]+$' then return false; end if;
     ordinal_number:=(r->>'ordinal')::integer;
     if not exists(select 1 from public.library_chunks c where c.document_id=d.id and c.ordinal=ordinal_number
       and c.pdf_page=page_number and c.body_sha256=r->>'body_sha256') then return false; end if;
   elsif r->>'kind'='reviewed-transcription' then
     if coalesce(r->>'transcription_id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
       or coalesce(r->>'transcription_sha256','') !~ '^[a-f0-9]{64}$' then return false; end if;
     select * into t from public.library_reviewed_transcriptions where id=(r->>'transcription_id')::uuid;
     if not found then return false; end if;
     if t.status<>'approved' or t.reviewer_id is null or t.reviewed_at is null
       or t.document_id<>d.id or t.pdf_page<>page_number or t.body_sha256 is distinct from r->>'body_sha256'
       or t.payload_sha256 is distinct from r->>'transcription_sha256'
       or t.document_fingerprint is distinct from egel_private.library_shared_document_fingerprint(d.id)
     then return false; end if;
   else return false;
   end if;
 end loop;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;

create or replace function egel_private.stamp_shared_tutor_base() returns trigger
language plpgsql security invoker set search_path='' as $$
declare q public.questions; citations_value jsonb;
begin
 select * into strict q from public.questions where id=new.question_id and version=new.question_version;
 if tg_op='INSERT' then new.question_stem:=q.stem; new.question_options:=q.options; new.status:='draft'; end if;
 if new.status<>'withdrawn' and not egel_private.shared_base_sources_valid(new.sources) then
   raise exception 'BASE_SOURCES_INVALID' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object('document_id',r->>'document_id','catalog_id',r->>'catalog_id',
   'title',r->>'title','pdf_page',(r->>'pdf_page')::integer) order by n)
 into citations_value from jsonb_array_elements(new.sources) with ordinality s(r,n);
 new.citations:=citations_value;
 -- Preserve the legacy hash algorithm byte-for-byte for native Gemini rows.
 if new.model='gemini-3.8-flash' and not new.editorial_revision and new.provenance='{}'::jsonb then
   new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.question_id,new.question_version,
     new.question_stem,new.question_options,new.model,new.prompt_version,new.body,new.sources)::text,'UTF8')),'hex');
 else
   new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.question_id,new.question_version,
     new.question_stem,new.question_options,new.model,new.prompt_version,new.body,new.sources,
     new.editorial_revision,new.provenance)::text,'UTF8')),'hex');
 end if;
 if tg_op='UPDATE' and new.payload_sha256 is distinct from old.payload_sha256 then new.status:='draft'; end if;
 if new.status='draft' then new.reviewer_id:=null; new.reviewed_at:=null; new.review_note:=null; end if;
 return new;
end; $$;

-- Acquire the common publication lock BEFORE a row lock to avoid opposing
-- publishers locking different drafts and then trying to withdraw each other.
create or replace function public.publish_reviewed_tutor_base(p_id uuid,p_expected_hash text,
 p_reviewer uuid,p_review_note text,p_confirm_human_review boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b public.tutor_base_explanations; q public.questions;
begin
 if p_confirm_human_review is distinct from true or p_reviewer is null or p_review_note is null
   or length(trim(p_review_note))<20 or not exists(select 1 from public.profiles where user_id=p_reviewer)
 then raise exception 'HUMAN_REVIEW_REQUIRED' using errcode='22023'; end if;
 select * into strict b from public.tutor_base_explanations where id=p_id;
 perform pg_advisory_xact_lock(hashtextextended(b.question_id||':'||b.question_version||':'||b.prompt_version,0));
 select * into strict b from public.tutor_base_explanations where id=p_id for update;
 if b.status<>'draft' or b.payload_sha256 is distinct from p_expected_hash then
   raise exception 'BASE_REVIEW_CONFLICT' using errcode='40001'; end if;
 select * into strict q from public.questions where id=b.question_id and version=b.question_version;
 if b.question_stem<>q.stem or b.question_options<>q.options or not egel_private.shared_base_sources_valid(b.sources)
 then raise exception 'BASE_STALE' using errcode='22023'; end if;
 update public.tutor_base_explanations set status='withdrawn' where question_id=b.question_id
   and question_version=b.question_version and prompt_version=b.prompt_version and status='published';
 update public.tutor_base_explanations set status='published',reviewer_id=p_reviewer,
   review_note=trim(p_review_note),reviewed_at=now() where id=p_id;
 return p_id;
end; $$;

comment on table public.library_reviewed_transcriptions is
 'Backend-only, individually reviewed exact excerpts. Does not enable whole-book OCR. Edits reset approval; revocation or changed document metadata hides dependent shared explanations.';
comment on column public.tutor_base_explanations.provenance is
 'Backend-only generation and editorial hashes, not student data or an official answer key. Included in the approval fingerprint.';
notify pgrst,'reload schema';
