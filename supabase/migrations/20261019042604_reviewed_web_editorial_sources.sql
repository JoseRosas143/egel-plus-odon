-- Additive, operator-reviewed web supplements. No network fetch or model call.
-- Version aligned with the applied remote migration history.
-- v1 intentionally permits only the exact reviewed CUN terminology page.
create table public.library_reviewed_web_sources (
 id uuid primary key default gen_random_uuid(),
 url text not null check(url='https://www.cun.es/diccionario-medico/terminos/lipotimia'),
 title text not null check(length(trim(title)) between 1 and 500),
 publisher text not null check(length(trim(publisher)) between 1 and 200),
 summary text not null check(length(trim(summary)) between 50 and 2000),
 verified_at timestamptz not null,
 expires_at timestamptz not null,
 review_scope text not null check(length(trim(review_scope)) between 20 and 2000),
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','approved','revoked')),
 reviewer_id uuid references public.profiles(user_id), review_note text, reviewed_at timestamptz,
 check(expires_at>verified_at and expires_at<=verified_at+interval '90 days'),
 check(status<>'approved' or (reviewer_id is not null and reviewed_at is not null and review_note is not null and length(trim(review_note))>=20))
);
create index reviewed_web_reviewer_idx on public.library_reviewed_web_sources(reviewer_id) where reviewer_id is not null;
alter table public.library_reviewed_web_sources enable row level security;
revoke all on public.library_reviewed_web_sources from public,anon,authenticated;
grant select,insert,update,delete on public.library_reviewed_web_sources to service_role;
create policy reviewed_web_backend_only on public.library_reviewed_web_sources for all to service_role using(true) with check(true);

create function egel_private.stamp_reviewed_web_source() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.url,new.title,new.publisher,new.summary,
   new.verified_at,new.expires_at,new.review_scope)::text,'UTF8')),'hex');
 if tg_op='INSERT' then new.status:='draft';
 elsif new.payload_sha256 is distinct from old.payload_sha256 then new.status:='draft'; end if;
 if new.status='draft' then new.reviewer_id:=null;new.reviewed_at:=null;new.review_note:=null;end if;
 return new;
end; $$;
revoke all on function egel_private.stamp_reviewed_web_source() from public,anon,authenticated;
create trigger stamp_reviewed_web_source before insert or update on public.library_reviewed_web_sources
 for each row execute function egel_private.stamp_reviewed_web_source();

create function public.approve_reviewed_web_source(p_id uuid,p_expected_hash text,p_reviewer uuid,p_note text,p_confirm boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare w public.library_reviewed_web_sources;
begin
 if p_confirm is distinct from true or p_reviewer is null or length(trim(coalesce(p_note,'')))<20
   or not exists(select 1 from public.profiles where user_id=p_reviewer) then raise exception 'HUMAN_REVIEW_REQUIRED';end if;
 select * into strict w from public.library_reviewed_web_sources where id=p_id for update;
 if w.status<>'draft' or w.payload_sha256 is distinct from p_expected_hash then raise exception 'WEB_REVIEW_CONFLICT';end if;
 if w.verified_at>now() or w.expires_at<=now() then raise exception 'WEB_REVIEW_STALE';end if;
 update public.library_reviewed_web_sources set status='approved',reviewer_id=p_reviewer,review_note=trim(p_note),reviewed_at=now() where id=p_id;
 return p_id;
end; $$;
revoke all on function public.approve_reviewed_web_source(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.approve_reviewed_web_source(uuid,text,uuid,text,boolean) to service_role;

alter table public.tutor_base_explanations add column web_sources jsonb not null default '[]';
create function egel_private.shared_base_web_sources_valid(p_sources jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;w public.library_reviewed_web_sources;seen uuid[]:='{}';
begin
 if jsonb_typeof(p_sources) is distinct from 'array' then return false;end if;
 if jsonb_array_length(p_sources)>3 then return false;end if;
 for r in select value from jsonb_array_elements(p_sources) loop
   if jsonb_typeof(r) is distinct from 'object' then return false;end if;
   if (select count(*) from jsonb_object_keys(r))<>6
     or r->>'kind' is distinct from 'reviewed-web'
     or coalesce(r->>'web_source_id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
     or coalesce(r->>'web_source_sha256','')!~'^[a-f0-9]{64}$' then return false;end if;
   select * into w from public.library_reviewed_web_sources where id=(r->>'web_source_id')::uuid;
   if not found then return false;end if;
   if w.id=any(seen) or w.status<>'approved' or w.reviewer_id is null or w.reviewed_at is null
     or w.verified_at>now() or w.expires_at<=now() or w.payload_sha256 is distinct from r->>'web_source_sha256'
     or w.url is distinct from r->>'url' or w.title is distinct from r->>'title' or w.publisher is distinct from r->>'publisher'
   then return false;end if;
   seen:=array_append(seen,w.id);
 end loop;return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;
revoke all on function egel_private.shared_base_web_sources_valid(jsonb) from public,anon,authenticated;
grant execute on function egel_private.shared_base_web_sources_valid(jsonb) to service_role;

-- A new variant is invisible to older readers; PDF-only bases retain hashes.
alter table public.tutor_base_explanations drop constraint tutor_base_model_and_provenance_check;
alter table public.tutor_base_explanations add constraint tutor_base_model_and_provenance_check check((
 (model='gemini-3.8-flash' and prompt_version='literature-base-v1' and not editorial_revision and provenance='{}'::jsonb)
 or (model='deepseek-flash' and prompt_version in ('literature-editorial-v1','literature-editorial-web-v1') and editorial_revision
   and jsonb_typeof(provenance)='object' and provenance->>'provider'='deepseek'
   and provenance->>'generation_prompt_version'='literature-draft-v2'
   and provenance->>'run_fingerprint' ~ '^[a-f0-9]{64}$'
   and provenance->>'draft_markdown_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'editorial_document_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'editorial_approval_sha256' ~ '^[a-f0-9]{64}$')
) is true);
alter table public.tutor_base_explanations add constraint tutor_base_web_variant_check check(
 (web_sources='[]'::jsonb and prompt_version<>'literature-editorial-web-v1') or
 (prompt_version='literature-editorial-web-v1' and jsonb_typeof(web_sources)='array'
  and jsonb_array_length(web_sources) between 1 and 3
  and (provenance->>'web_approval_sha256' ~ '^[a-f0-9]{64}$') is true));

create or replace function egel_private.stamp_shared_tutor_base() returns trigger
language plpgsql security invoker set search_path='' as $$
declare q public.questions;citations_value jsonb;
begin
 select * into strict q from public.questions where id=new.question_id and version=new.question_version;
 if tg_op='INSERT' then new.question_stem:=q.stem;new.question_options:=q.options;new.status:='draft';end if;
 if new.status<>'withdrawn' and (not egel_private.shared_base_sources_valid(new.sources)
   or not egel_private.shared_base_web_sources_valid(new.web_sources)) then raise exception 'BASE_SOURCES_INVALID' using errcode='22023';end if;
 select jsonb_agg(jsonb_build_object('document_id',r->>'document_id','catalog_id',r->>'catalog_id',
   'title',r->>'title','pdf_page',(r->>'pdf_page')::integer) order by n) into citations_value
 from jsonb_array_elements(new.sources) with ordinality s(r,n);
 new.citations:=citations_value;
 if new.web_sources<>'[]'::jsonb then
   new.citations:=new.citations||(select jsonb_agg(jsonb_build_object('kind','reviewed-web','title',w.title,
     'publisher',w.publisher,'url',w.url,'verified_at',w.verified_at) order by n)
     from jsonb_array_elements(new.web_sources) with ordinality s(r,n)
     join public.library_reviewed_web_sources w on w.id=(r->>'web_source_id')::uuid);
   new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.question_id,new.question_version,
     new.question_stem,new.question_options,new.model,new.prompt_version,new.body,new.sources,
     new.editorial_revision,new.provenance,new.web_sources)::text,'UTF8')),'hex');
 elsif new.model='gemini-3.8-flash' and not new.editorial_revision and new.provenance='{}'::jsonb then
   new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.question_id,new.question_version,
     new.question_stem,new.question_options,new.model,new.prompt_version,new.body,new.sources)::text,'UTF8')),'hex');
 else
   new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.question_id,new.question_version,
     new.question_stem,new.question_options,new.model,new.prompt_version,new.body,new.sources,
     new.editorial_revision,new.provenance)::text,'UTF8')),'hex');
 end if;
 if tg_op='UPDATE' and new.payload_sha256 is distinct from old.payload_sha256 then new.status:='draft';end if;
 if new.status='draft' then new.reviewer_id:=null;new.reviewed_at:=null;new.review_note:=null;end if;
 return new;
end; $$;

-- Same private boolean-only helper and ownership check, plus web freshness.
create or replace function egel_private.can_read_shared_tutor_base(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'
 and exists(select 1 from public.tutor_base_explanations b
 join public.questions q on q.id=b.question_id and q.version=b.question_version
 where b.id=p_id and b.status='published' and b.reviewed_at is not null
 and b.question_stem=q.stem and b.question_options=q.options
 and exists(select 1 from public.question_attempts a where a.user_id=(select auth.uid()) and a.question_id=b.question_id and a.question_version=b.question_version)
 and egel_private.shared_base_sources_valid(b.sources) and egel_private.shared_base_web_sources_valid(b.web_sources));
$$;
comment on table public.library_reviewed_web_sources is 'Backend-only reviewed editorial web summaries. Exact allowlisted URL; no PDF identity, network fetch or automatic approval. Edits, expiry and revocation hide dependent bases.';
notify pgrst,'reload schema';
