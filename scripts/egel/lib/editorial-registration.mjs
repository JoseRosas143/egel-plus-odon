import {hashText} from './pilot-candidates.mjs';
import {prepareEditorialBase} from './editorial-base.mjs';

// Operator SQL plan only: does not connect, fetch, load credentials or publish.
// The caller must execute the plan against the intended project after review.
export function buildEditorialDraftRegistration(preparation,sourceReview,email) {
  const prepared=prepareEditorialBase(preparation),reviewerEmail=email?.trim().toLowerCase();
  if(typeof reviewerEmail!=='string'||reviewerEmail.length>254||!/^[^\s@\0]+@[^\s@\0]+\.[^\s@\0]+$/.test(reviewerEmail))throw Error('REGISTRATION_INVALID_EMAIL');
  if(sourceReview?.humanSourceReview!==true || sourceReview.sourceSharingApproved!==true || sourceReview.questionId!==prepared.question.id ||
    !Array.isArray(sourceReview.edits) || sourceReview.edits.length!==prepared.sources.length)throw Error('REGISTRATION_SOURCE_APPROVAL_REQUIRED');
  // Legacy single-book receipts remain valid. Multi-book receipts must explicitly
  // enumerate exactly the approved PDF fingerprints; neither extras nor omissions
  // may broaden the human-approved source scope.
  const multiple=Object.hasOwn(sourceReview,'sourcePdfSha256s');
  const documentHashes=multiple?sourceReview.sourcePdfSha256s:[sourceReview.sourcePdfSha256];
  const expectedDocuments=new Set(prepared.sources.map(s=>s.documentId));
  if((multiple&&Object.hasOwn(sourceReview,'sourcePdfSha256')) || !Array.isArray(documentHashes) ||
    !documentHashes.length || documentHashes.length>6 ||
    documentHashes.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id)) ||
    new Set(documentHashes).size!==documentHashes.length || documentHashes.length!==expectedDocuments.size ||
    documentHashes.some(id=>!expectedDocuments.has(id)))throw Error('REGISTRATION_SOURCE_APPROVAL_MISMATCH');
  const approvedDocuments=new Set(documentHashes);
  const seen=new Set();
  const sourceApprovalSha256=hashText(JSON.stringify(sourceReview));
  const sources=prepared.sources.map(s=>{
    const matches=sourceReview.edits.filter(e=>e.documentId===s.documentId&&e.pdfPage===s.pdfPage&&e.ordinal===s.localOrdinal&&e.newTextSha256===s.textSha256);
    if(matches.length!==1 || seen.has(`${s.documentId}:${s.pdfPage}:${s.localOrdinal}`) || !approvedDocuments.has(s.documentId))throw Error('REGISTRATION_SOURCE_APPROVAL_MISMATCH');
    seen.add(`${s.documentId}:${s.pdfPage}:${s.localOrdinal}`);const e=matches[0];
    if(typeof e.locator!=='string'||!e.locator.trim()||e.locator.length>500||e.locator.includes('\0')||
      typeof e.reason!=='string'||e.reason.trim().length<20||e.reason.length>1700||e.reason.includes('\0'))throw Error('REGISTRATION_INVALID_LOCATOR');
    return {...s,locator:e.locator,revisionNote:e.reason+'\nSource approval receipt SHA256: '+sourceApprovalSha256};
  });
  const registrationKey=hashText(JSON.stringify({preparation:prepared.preparationSha256,sourceApprovalSha256,reviewerEmail}));
  const payload={question:prepared.question,editorial:prepared.editorial,reviewerEmail,sources,registrationKey,
    sourceReviewNote:'Human source approval recorded in chat; source receipt SHA256 '+sourceApprovalSha256+'. Account linked by supplied email. No student publication.',
    provenance:{provider:'deepseek',generation_prompt_version:prepared.provenance.promptVersion,
      run_fingerprint:prepared.provenance.runFingerprint,draft_markdown_sha256:prepared.provenance.draftMarkdownSha256,
      editorial_document_sha256:prepared.editorial.sha256,editorial_approval_sha256:hashText(JSON.stringify(preparation.approval)),
      source_approval_sha256:sourceApprovalSha256,preparation_sha256:prepared.preparationSha256,registration_key:registrationKey}};
  const json=JSON.stringify(payload),tag='$egel_payload_'+registrationKey.slice(0,24)+'$',outer='$egel_register_'+registrationKey.slice(0,24)+'$';
  if(json.includes(tag)||json.includes(outer))throw Error('REGISTRATION_DELIMITER_CONFLICT');
  const query=`do ${outer}
declare
 p jsonb := ${tag}${json}${tag}::jsonb;
 reviewer uuid; q public.questions; d public.library_documents;
 t public.library_reviewed_transcriptions; b public.tutor_base_explanations;
 s jsonb; refs jsonb := '[]'::jsonb; expected_provenance jsonb; matches integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('editorial-draft:'||(p->>'registrationKey'),0));
 select u.id into strict reviewer from auth.users u join public.profiles pr on pr.user_id=u.id
 where lower(u.email)=p->>'reviewerEmail' and u.email_confirmed_at is not null
   and coalesce(u.is_anonymous,false)=false and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<=now()) for share of u,pr;
 select * into strict q from public.questions where id=p->'question'->>'id'
   and version=(p->'question'->>'version')::smallint for share;
 if q.stem is distinct from p->'question'->>'stem' or
   (select jsonb_agg(jsonb_build_object('letter',o->>'letter','text',o->>'text') order by n)
    from jsonb_array_elements(q.options) with ordinality v(o,n)) is distinct from p->'question'->'options'
 then raise exception 'REGISTRATION_QUESTION_CHANGED'; end if;
 if encode(sha256(convert_to(p->'editorial'->>'markdown','UTF8')),'hex') is distinct from p->'editorial'->>'sha256'
 then raise exception 'REGISTRATION_BODY_CHANGED'; end if;
 -- Consistent lock order even when two plans list the same pages differently.
 for s in select value from jsonb_array_elements(p->'sources') order by value->>'documentId',value->>'pdfPage',value->>'textSha256' loop
   perform pg_advisory_xact_lock(hashtextextended('editorial-source:'||(s->>'documentId')||':'||(s->>'pdfPage')||':'||(s->>'textSha256'),0));
 end loop;
 for s in select value from jsonb_array_elements(p->'sources') loop
   select * into strict d from public.library_documents where id=s->>'documentId' for share;
   if d.title is distinct from s->>'title' or egel_private.library_shared_document_fingerprint(d.id) is null
     or (s->>'pdfPage')::integer>d.page_count
     or encode(sha256(convert_to(s->>'text','UTF8')),'hex') is distinct from s->>'textSha256'
   then raise exception 'REGISTRATION_SOURCE_CHANGED'; end if;
   if exists(select 1 from public.library_reviewed_transcriptions x where x.document_id=d.id
     and x.pdf_page=(s->>'pdfPage')::integer and x.body_sha256=s->>'textSha256' and x.status='revoked')
   then raise exception 'REGISTRATION_SOURCE_REVOKED'; end if;
   select count(*) into matches from public.library_reviewed_transcriptions x where x.document_id=d.id
     and x.pdf_page=(s->>'pdfPage')::integer and x.body=s->>'text'
     and x.source_locator=s->>'locator' and x.revision_note=s->>'revisionNote';
   if matches>1 then raise exception 'REGISTRATION_SOURCE_AMBIGUOUS'; end if;
   if matches=0 then
     insert into public.library_reviewed_transcriptions(document_id,pdf_page,body,source_locator,revision_note)
     values(d.id,(s->>'pdfPage')::integer,s->>'text',s->>'locator',s->>'revisionNote') returning * into t;
   else
     select * into strict t from public.library_reviewed_transcriptions x where x.document_id=d.id
       and x.pdf_page=(s->>'pdfPage')::integer and x.body=s->>'text'
       and x.source_locator=s->>'locator' and x.revision_note=s->>'revisionNote' for update;
   end if;
   if t.document_fingerprint is distinct from egel_private.library_shared_document_fingerprint(d.id)
   then raise exception 'REGISTRATION_SOURCE_STALE'; end if;
   if t.status='draft' then
     perform public.approve_reviewed_library_transcription(t.id,t.payload_sha256,reviewer,p->>'sourceReviewNote',true);
   elsif t.status<>'approved' or t.reviewer_id is distinct from reviewer or t.review_note is distinct from p->>'sourceReviewNote'
   then raise exception 'REGISTRATION_SOURCE_REVIEW_CONFLICT'; end if;
   refs:=refs||jsonb_build_array(jsonb_build_object('kind','reviewed-transcription','document_id',d.id,
     'catalog_id',d.catalog_id,'title',d.title,'pdf_page',t.pdf_page,'body_sha256',t.body_sha256,
     'transcription_id',t.id,'transcription_sha256',t.payload_sha256));
 end loop;
 expected_provenance:=(p->'provenance')||jsonb_build_object('prepared_by_reviewer_id',reviewer);
 select count(*) into matches from public.tutor_base_explanations x
   where x.provenance->>'registration_key'=p->>'registrationKey';
 if matches>1 then raise exception 'REGISTRATION_BASE_AMBIGUOUS'; end if;
 if matches=0 then
   insert into public.tutor_base_explanations(question_id,question_version,model,prompt_version,editorial_revision,body,sources,provenance)
   values(q.id,q.version,'deepseek-flash','literature-editorial-v1',true,p->'editorial'->>'markdown',refs,expected_provenance) returning * into b;
 else
   select * into strict b from public.tutor_base_explanations x
     where x.provenance->>'registration_key'=p->>'registrationKey' for update;
   if b.status<>'draft' or b.question_id<>q.id or b.question_version<>q.version
     or b.question_stem<>q.stem or b.question_options<>q.options
     or b.body is distinct from p->'editorial'->>'markdown' or b.sources<>refs or b.provenance<>expected_provenance
     or b.model<>'deepseek-flash' or b.prompt_version<>'literature-editorial-v1' or not b.editorial_revision
     or not egel_private.shared_base_sources_valid(b.sources)
   then raise exception 'REGISTRATION_BASE_CONFLICT'; end if;
 end if;
 if b.status<>'draft' or b.reviewer_id is not null or b.reviewed_at is not null
 then raise exception 'REGISTRATION_UNEXPECTED_PUBLICATION'; end if;
end;
${outer};
select id as base_id,status,payload_sha256,reviewer_id as publication_reviewer_id,
 provenance->>'prepared_by_reviewer_id' as prepared_by_reviewer_id,
 jsonb_array_length(sources) as source_count
from public.tutor_base_explanations where provenance->>'registration_key'='${registrationKey}';`;
  return {query,registrationKey,preparationSha256:prepared.preparationSha256,
    plan:{questionId:prepared.question.id,sourceCount:sources.length,baseStatus:'draft',publish:false,newModelCalls:0,sourceApprovalSha256}};
}
