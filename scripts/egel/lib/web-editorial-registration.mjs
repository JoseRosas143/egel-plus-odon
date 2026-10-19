import {hashText} from './pilot-candidates.mjs';
import {prepareEditorialBase} from './editorial-base.mjs';
import {buildEditorialDraftRegistration} from './editorial-registration.mjs';

const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!s.includes('\0');
export function buildWebEditorialDraftRegistration(input,sourceReview,email){
  if(!exact(input,['bookPreparation','webEvidence','approval']))throw Error('WEB_INVALID_INPUT');
  const prepared=prepareEditorialBase(input.bookPreparation),web=input.webEvidence,a=input.approval;
  if(!Array.isArray(web)||web.length!==1)throw Error('WEB_EVIDENCE_INVALID');
  for(const s of web){
    if(!exact(s,['url','title','publisher','summary','verifiedAt','expiresAt','reviewScope','reviewed'])||s.reviewed!==true||
      s.url!=='https://www.cun.es/diccionario-medico/terminos/lipotimia'||!text(s.title,500)||!text(s.publisher,200)||
      !text(s.summary,2000)||s.summary.trim().length<50||!text(s.reviewScope,2000)||s.reviewScope.trim().length<20||
      !Number.isFinite(Date.parse(s.verifiedAt))||!Number.isFinite(Date.parse(s.expiresAt))||
      Date.parse(s.expiresAt)<=Date.parse(s.verifiedAt)||Date.parse(s.expiresAt)-Date.parse(s.verifiedAt)>90*86400000||
      !prepared.editorial.markdown.includes(s.url))throw Error('WEB_EVIDENCE_INVALID');
  }
  if(!exact(a,['humanApproved','scope','approvedAt','bodySha256','webEvidenceSha256','recordedVia'])||a.humanApproved!==true||
    a.scope!=='prepare-web-supplement-only'||a.recordedVia!=='direct-user-chat'||!Number.isFinite(Date.parse(a.approvedAt))||
    a.bodySha256!==prepared.editorial.sha256||a.webEvidenceSha256!==hashText(JSON.stringify(web)))throw Error('WEB_APPROVAL_REQUIRED');
  const book=buildEditorialDraftRegistration(input.bookPreparation,sourceReview,email);
  const approvalSha256=hashText(JSON.stringify(a));
  const key=hashText(JSON.stringify({book:book.registrationKey,web,approvalSha256}));
  const payload={web,approvalSha256,key,bookKey:book.registrationKey,bodySha256:prepared.editorial.sha256};
  const tag='$web_payload_'+key.slice(0,24)+'$',outer='$web_register_'+key.slice(0,24)+'$',legacy='$web_book_'+key.slice(0,24)+'$';
  const bookQuery=book.query.slice(0,book.query.indexOf('\nselect id as base_id'));
  const json=JSON.stringify(payload);
  if([tag,outer,legacy].some(t=>json.includes(t)||bookQuery.includes(t)))throw Error('WEB_DELIMITER_CONFLICT');
  const query=`do ${outer}
declare p jsonb:=${tag}${json}${tag}::jsonb; b public.tutor_base_explanations;
 w public.library_reviewed_web_sources; s jsonb; reviewer uuid; refs jsonb:='[]';
begin
 perform pg_advisory_xact_lock(hashtextextended('web-editorial:'||(p->>'key'),0));
 select * into b from public.tutor_base_explanations where provenance->>'web_registration_key'=p->>'key';
 if found then
   if b.status not in ('draft','published') or encode(sha256(convert_to(b.body,'UTF8')),'hex')<>p->>'bodySha256'
     or b.prompt_version<>'literature-editorial-web-v1' or not egel_private.shared_base_sources_valid(b.sources)
     or not egel_private.shared_base_web_sources_valid(b.web_sources) then raise exception 'WEB_REGISTRATION_CONFLICT';end if;
 else
   execute ${legacy}${bookQuery}${legacy};
   select * into strict b from public.tutor_base_explanations where provenance->>'registration_key'=p->>'bookKey' for update;
   reviewer:=(b.provenance->>'prepared_by_reviewer_id')::uuid;
   for s in select value from jsonb_array_elements(p->'web') loop
     insert into public.library_reviewed_web_sources(url,title,publisher,summary,verified_at,expires_at,review_scope)
     values(s->>'url',s->>'title',s->>'publisher',s->>'summary',(s->>'verifiedAt')::timestamptz,(s->>'expiresAt')::timestamptz,s->>'reviewScope') returning * into w;
     perform public.approve_reviewed_web_source(w.id,w.payload_sha256,reviewer,
       'Explicit chat approval of editorial terminology supplement; receipt SHA256 '||(p->>'approvalSha256'),true);
     refs:=refs||jsonb_build_array(jsonb_build_object('kind','reviewed-web','web_source_id',w.id,
       'web_source_sha256',w.payload_sha256,'url',w.url,'title',w.title,'publisher',w.publisher));
   end loop;
   update public.tutor_base_explanations set prompt_version='literature-editorial-web-v1',web_sources=refs,
     provenance=provenance||jsonb_build_object('web_registration_key',p->>'key','web_approval_sha256',p->>'approvalSha256') where id=b.id;
 end if;
 if not exists(select 1 from public.questions q where q.id=b.question_id and q.version=b.question_version
   and q.stem=b.question_stem and q.options=b.question_options) then raise exception 'WEB_QUESTION_CHANGED';end if;
end;
${outer};
select id as base_id,status,payload_sha256,reviewer_id as publication_reviewer_id,
 provenance->>'prepared_by_reviewer_id' as prepared_by_reviewer_id,
 jsonb_array_length(sources) as source_count,jsonb_array_length(web_sources) as web_source_count
from public.tutor_base_explanations where provenance->>'web_registration_key'='${key}';`;
  return {query,registrationKey:key,plan:{questionId:prepared.question.id,baseStatus:'draft',publish:false,newModelCalls:0,webSourceCount:web.length}};
}
