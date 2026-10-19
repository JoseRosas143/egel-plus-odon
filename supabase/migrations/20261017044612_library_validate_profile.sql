-- The service role deliberately cannot SELECT auth.users. Session validity is
-- checked with auth.getUser by the server caller; require an existing profile.
create or replace function public.search_tutor_library(p_user_id uuid, p_query text, p_limit integer default 6)
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
    and exists (select 1 from public.profiles p where p.user_id = p_user_id)
    and length(trim(p_query)) between 3 and 400
    and d.evidence_enabled and d.upload_state = 'verified' and d.source_kind = 'literature'
    and (d.visibility = 'common' or (d.visibility = 'personal' and d.owner_id = p_user_id))
    and (c.search_es @@ q.es or c.search_en @@ q.en)
  order by rank desc, d.id, c.ordinal
  limit least(greatest(coalesce(p_limit, 6), 1), 8);
$$;
revoke all on function public.search_tutor_library(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_tutor_library(uuid, text, integer) to service_role;
