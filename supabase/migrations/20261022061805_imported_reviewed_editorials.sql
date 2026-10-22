-- Separate provenance path: imported editorial text, never a fabricated model run.
-- Only the approved 001/003/006 pilot; legacy bases and student records untouched.
create function egel_private.imported_editorial_sources_valid(p_question text,p_sources jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb; expected text; seen text[]:='{}';
begin
 if p_question not in ('EGEL-2026-001','EGEL-2026-003','EGEL-2026-006') or p_question is null
   or jsonb_typeof(p_sources) is distinct from 'array' then return false;end if;
 if jsonb_array_length(p_sources)<>3 then return false;end if;
 for s in select value from jsonb_array_elements(p_sources) loop
   if jsonb_typeof(s) is distinct from 'object' then return false;end if;
   if (select count(*) from jsonb_object_keys(s))<>7 or s->>'reference_id' is null or s->>'reference_id'=any(seen)
     or (s->'permission_confirmed') is distinct from 'true'::jsonb
     or length(trim(coalesce(s->>'title',''))) not between 1 and 500
     or length(trim(coalesce(s->>'review_scope',''))) not between 1 and 4000
     or length(trim(coalesce(s->>'review_method',''))) not between 1 and 100
     or not (s ? 'license') or jsonb_typeof(s->'license') not in ('null','string') then return false;end if;
   expected:=case p_question||':'||(s->>'reference_id')
     when 'EGEL-2026-001:R2' then 'https://www.kidney.org/kidney-topics/creatinine'
     when 'EGEL-2026-001:R3' then 'https://cdho.org/factsheets/chronic-kidney-disease/'
     when 'EGEL-2026-001:R4' then 'https://kdigo.org/wp-content/uploads/2026/05/KDIGO-2024-CKD-Guideline-Summary-Recommendations-and-Practice-Points.pdf'
     when 'EGEL-2026-003:R2' then 'https://pubmed.ncbi.nlm.nih.gov/36246819/'
     when 'EGEL-2026-003:R3' then 'https://digitalhistology.org/organs-systems/digestive/oral-cavity/tooth/tooth-development/tooth-development-6/'
     when 'EGEL-2026-003:R4' then 'https://digitalhistology.org/organs-systems/digestive/oral-cavity/tooth/tooth-development/tooth-development-9/'
     when 'EGEL-2026-006:R2' then 'https://www.cdc.gov/epstein-barr/about/mononucleosis.html'
     when 'EGEL-2026-006:R3' then 'https://www.cdc.gov/measles/hcp/clinical-overview/index.html'
     when 'EGEL-2026-006:R4' then 'https://medlineplus.gov/ency/article/000969.htm' end;
   if expected is null or s->>'url' is distinct from expected then return false;end if;
   seen:=array_append(seen,s->>'reference_id');
 end loop;return true;
end; $$;
revoke all on function egel_private.imported_editorial_sources_valid(text,jsonb) from public,anon,authenticated;
grant execute on function egel_private.imported_editorial_sources_valid(text,jsonb) to service_role;

create table public.tutor_imported_editorials (
 id uuid primary key default gen_random_uuid(),
 question_id text not null check(question_id in ('EGEL-2026-001','EGEL-2026-003','EGEL-2026-006')),
 question_version smallint not null,
 question_stem text not null,
 question_options jsonb not null,
 format_version text not null default 'imported-editorial-v1' check(format_version='imported-editorial-v1'),
 body text not null check(length(body) between 100 and 30000),
 sources jsonb not null check(egel_private.imported_editorial_sources_valid(question_id,sources)),
 provenance jsonb not null check((jsonb_typeof(provenance)='object' and provenance->>'kind'='imported-chat-editorial'
   and provenance->'provider_verified'='null'::jsonb and provenance->'model_verified'='null'::jsonb
   and provenance->>'source_batch_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'source_record_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'source_packet_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'preparation_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'content_approval_sha256' ~ '^[a-f0-9]{64}$'
   and provenance->>'publication_authorization_sha256' ~ '^[a-f0-9]{64}$'
   and provenance-array['kind','provider_verified','model_verified','source_batch_sha256','source_record_sha256',
     'source_packet_sha256','preparation_sha256','content_approval_sha256','publication_authorization_sha256']='{}'::jsonb) is true),
 registration_key text not null unique check(registration_key ~ '^[a-f0-9]{64}$'),
 citations jsonb not null default '[]',
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','published','withdrawn')),
 reviewer_id uuid references public.profiles(user_id),review_note text,reviewed_at timestamptz,valid_until timestamptz,
 created_at timestamptz not null default now(),
 foreign key(question_id,question_version) references public.questions(id,version),
 check((status<>'published' or (reviewer_id is not null and reviewed_at is not null and valid_until is not null
   and length(trim(coalesce(review_note,'')))>=20 and valid_until>reviewed_at and valid_until<=reviewed_at+interval '90 days')) is true)
);
create unique index imported_editorial_one_publication on public.tutor_imported_editorials(question_id,question_version) where status='published';
create index imported_editorial_question_idx on public.tutor_imported_editorials(question_id,question_version);
create index imported_editorial_reviewer_idx on public.tutor_imported_editorials(reviewer_id) where reviewer_id is not null;
alter table public.tutor_imported_editorials enable row level security;
grant usage on schema egel_private to authenticated,service_role;
revoke all on public.tutor_imported_editorials from public,anon,authenticated;
grant select,insert,update,delete on public.tutor_imported_editorials to service_role;
grant select(id,question_id,question_version,format_version,body,citations,reviewed_at,valid_until) on public.tutor_imported_editorials to authenticated;
create policy imported_editorial_backend on public.tutor_imported_editorials for all to service_role using(true) with check(true);

create function egel_private.stamp_imported_editorial() returns trigger
language plpgsql security invoker set search_path='' as $$
declare q public.questions;
begin
 select * into strict q from public.questions where id=new.question_id and version=new.question_version;
 if tg_op='INSERT' then new.question_stem:=q.stem;new.question_options:=q.options;new.status:='draft';end if;
 new.citations:=(select jsonb_agg(jsonb_build_object('kind','editorial-reference','reference_id',s->>'reference_id',
   'title',s->>'title','url',s->>'url','review_scope',s->>'review_scope') order by s->>'reference_id') from jsonb_array_elements(new.sources) s);
 new.payload_sha256:=encode(sha256(convert_to(jsonb_build_array(new.question_id,new.question_version,new.question_stem,
   new.question_options,new.format_version,new.body,new.sources,new.provenance,new.registration_key)::text,'UTF8')),'hex');
 if tg_op='UPDATE' and new.payload_sha256 is distinct from old.payload_sha256 then new.status:='draft';end if;
 if new.status='draft' then new.reviewer_id:=null;new.review_note:=null;new.reviewed_at:=null;new.valid_until:=null;end if;
 return new;
end; $$;
revoke all on function egel_private.stamp_imported_editorial() from public,anon,authenticated;
create trigger stamp_imported_editorial before insert or update on public.tutor_imported_editorials
 for each row execute function egel_private.stamp_imported_editorial();

-- Private boolean-only helper avoids granting students access to audit columns.
-- SECURITY DEFINER is isolated, has an empty search_path, authenticates the
-- caller and returns no draft/source/reviewer data. No new public definer RPC.
create function egel_private.can_read_imported_editorial(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and coalesce((select auth.jwt()->>'is_anonymous'),'false')='false'
 and exists(select 1 from public.tutor_imported_editorials b join public.questions q on q.id=b.question_id and q.version=b.question_version
 where b.id=p_id and b.status='published' and b.reviewed_at<=now() and b.valid_until>now()
   and b.question_stem=q.stem and b.question_options=q.options
   and egel_private.imported_editorial_sources_valid(b.question_id,b.sources)
   and exists(select 1 from public.question_attempts a where a.user_id=(select auth.uid())
     and a.question_id=b.question_id and a.question_version=b.question_version));
$$;
revoke all on function egel_private.can_read_imported_editorial(uuid) from public,anon,authenticated;
grant execute on function egel_private.can_read_imported_editorial(uuid) to authenticated;
create policy imported_editorial_read_after_own_answer on public.tutor_imported_editorials for select to authenticated
 using(egel_private.can_read_imported_editorial(id));

create function public.publish_imported_editorial(p_id uuid,p_hash text,p_reviewer uuid,p_note text,p_confirm boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b public.tutor_imported_editorials;q public.questions;
begin
 if p_confirm is distinct from true or length(trim(coalesce(p_note,'')))<20 or not exists(
   select 1 from auth.users u join public.profiles p on p.user_id=u.id where u.id=p_reviewer
   and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<=now())) then raise exception 'IMPORTED_HUMAN_APPROVAL_REQUIRED';end if;
 select * into strict b from public.tutor_imported_editorials where id=p_id;
 perform pg_advisory_xact_lock(hashtextextended('imported-editorial:'||b.question_id||':'||b.question_version,0));
 select * into strict b from public.tutor_imported_editorials where id=p_id for update;
 if b.status<>'draft' or b.payload_sha256 is distinct from p_hash then raise exception 'IMPORTED_REVIEW_CONFLICT';end if;
 select * into strict q from public.questions where id=b.question_id and version=b.question_version for share;
 if b.question_stem is distinct from q.stem or b.question_options is distinct from q.options
   or not egel_private.imported_editorial_sources_valid(b.question_id,b.sources) then raise exception 'IMPORTED_STALE';end if;
 if exists(select 1 from public.tutor_imported_editorials where question_id=b.question_id and question_version=b.question_version and status='published')
   then raise exception 'IMPORTED_ALREADY_PUBLISHED';end if;
 update public.tutor_imported_editorials set status='published',reviewer_id=p_reviewer,review_note=trim(p_note),reviewed_at=now(),valid_until=now()+interval '90 days' where id=p_id;
 return p_id;
end; $$;
revoke all on function public.publish_imported_editorial(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.publish_imported_editorial(uuid,text,uuid,text,boolean) to service_role;
comment on table public.tutor_imported_editorials is 'Human-approved imported editorial explanations. Provider/model unknown, not an official answer key. Sources/rights approval audit is backend-only. Reads require own saved answer; edits, withdrawal, expiry or question changes hide content. No student writes or paid generation.';
notify pgrst,'reload schema';
