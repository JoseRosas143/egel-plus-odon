-- Preserve the existing 50 MB upload limit and spend cap. Large original PDFs
-- are stored as ordered binary parts, never as public or student-readable files.
alter table public.library_documents add column part_count integer not null default 1 check (part_count between 1 and 1000);
comment on column public.library_documents.object_path is 'Logical original PDF path; for multipart documents reconstruct ordered library_document_parts and verify the original file hash.';
create table public.library_document_parts (
  document_id text not null references public.library_documents(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  object_path text not null unique check (object_path ~ '^sha256/[a-f0-9]{64}(/part-[0-9]{4}\.bin|\.pdf)$'),
  start_byte bigint not null check (start_byte >= 0),
  file_bytes bigint not null check (file_bytes between 1 and 50331648),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  primary key(document_id, ordinal)
);
alter table public.library_document_parts enable row level security;
revoke all on public.library_document_parts from public, anon, authenticated;
grant select, insert, update, delete on public.library_document_parts to service_role;
create policy library_document_parts_backend_only on public.library_document_parts for all to service_role using(true) with check(true);
