-- Common tutor evidence is NOT a public PDF library. No student role can read
-- storage objects, extracted text, or this service-only search RPC directly.
create table public.library_documents (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  catalog_id text check (catalog_id ~ '^BIB-[0-9]{3}$'),
  title text not null check (length(title) between 1 and 500),
  visibility text not null check (visibility in ('common', 'personal')),
  owner_id uuid references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('literature', 'exam_guide', 'excerpt', 'unclassified')),
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  bucket_id text not null default 'egel-library-private' check (bucket_id = 'egel-library-private'),
  object_path text not null unique check (object_path ~ '^sha256/[a-f0-9]{64}\.pdf$'),
  file_bytes bigint not null check (file_bytes > 0),
  page_count integer not null check (page_count > 0),
  upload_state text not null default 'pending' check (upload_state in ('pending', 'verified')),
  extraction_state text not null default 'pending' check (extraction_state in ('pending', 'text_extracted', 'partial', 'failed')),
  indexed_pages integer not null default 0 check (indexed_pages between 0 and page_count),
  pending_pages integer not null default 0 check (pending_pages between 0 and page_count),
  extraction_version text,
  evidence_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((visibility = 'common' and owner_id is null) or (visibility = 'personal' and owner_id is not null)),
  check (not evidence_enabled or (source_kind = 'literature' and upload_state = 'verified' and indexed_pages > 0))
);
create index library_documents_owner_idx on public.library_documents(owner_id) where owner_id is not null;

create table public.library_chunks (
  document_id text not null references public.library_documents(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  pdf_page integer not null check (pdf_page > 0),
  start_char integer not null check (start_char >= 0),
  end_char integer not null check (end_char > start_char),
  body text not null check (length(body) between 100 and 4000),
  body_sha256 text not null check (body_sha256 ~ '^[a-f0-9]{64}$'),
  search_es tsvector generated always as (to_tsvector('spanish'::regconfig, body)) stored,
  search_en tsvector generated always as (to_tsvector('english'::regconfig, body)) stored,
  primary key (document_id, ordinal)
);
create index library_chunks_es_idx on public.library_chunks using gin(search_es);
create index library_chunks_en_idx on public.library_chunks using gin(search_en);
create index library_chunks_page_idx on public.library_chunks(document_id, pdf_page);

alter table public.library_documents enable row level security;
alter table public.library_chunks enable row level security;
revoke all on public.library_documents, public.library_chunks from public, anon, authenticated;
grant select, insert, update, delete on public.library_documents, public.library_chunks to service_role;
create policy library_documents_backend_only on public.library_documents for all to service_role using (true) with check (true);
create policy library_chunks_backend_only on public.library_chunks for all to service_role using (true) with check (true);

create function public.search_tutor_library(p_user_id uuid, p_query text, p_limit integer default 6)
returns table(document_id text, catalog_id text, title text, pdf_page integer, ordinal integer, body text, body_sha256 text, rank real)
language sql stable security invoker set search_path = ''
as $$
  with queries as (
    select websearch_to_tsquery('spanish'::regconfig, left(p_query, 400)) es,
           websearch_to_tsquery('english'::regconfig, left(p_query, 400)) en
  )
  select d.id, d.catalog_id, d.title, c.pdf_page, c.ordinal, c.body, c.body_sha256,
         greatest(ts_rank_cd(c.search_es, q.es), ts_rank_cd(c.search_en, q.en)) as rank
  from public.library_chunks c
  join public.library_documents d on d.id = c.document_id
  cross join queries q
  where p_user_id is not null
    and exists (select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until < now()))
    and length(trim(p_query)) between 3 and 400
    and d.evidence_enabled and d.upload_state = 'verified' and d.source_kind = 'literature'
    and (d.visibility = 'common' or (d.visibility = 'personal' and d.owner_id = p_user_id))
    and (c.search_es @@ q.es or c.search_en @@ q.en)
  order by rank desc, d.id, c.ordinal
  limit least(greatest(coalesce(p_limit, 6), 1), 8);
$$;
revoke all on function public.search_tutor_library(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_tutor_library(uuid, text, integer) to service_role;
comment on function public.search_tutor_library(uuid, text, integer) is 'Server-only lexical retrieval. Caller must supply the verified session user, never a client-selected ID. No PDF or download URLs.';
