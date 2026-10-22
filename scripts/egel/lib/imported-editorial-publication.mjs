import {hashText} from './pilot-candidates.mjs';
import {validateImportedEditorialBatch} from './imported-editorial.mjs';
const digest=value=>hashText(JSON.stringify(value));
const fail=code=>{throw Error(code);};
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);

// Produces an explicit, transactional operator plan; no env/network/SQL execution.
// Content/rights approval is distinct from permission to apply schema and publish.
export function buildImportedEditorialPublication(prepared,approval,authorization,reviewerId){
 validateImportedEditorialBatch(prepared);
 if(!uuid(reviewerId))fail('IMPORTED_REVIEWER_INVALID');
 if(approval?.schema!=='egel-user-content-sharing-approval-v1'||approval.recordedVia!=='direct-user-chat'||
   approval.scope!=='existing-editorial-texts-and-scoped-source-references-001-003-006'||approval.preparationBatchSha256!==prepared.preparationBatchSha256||
   approval.reviewReported?.contentApprovedForSharing!==true||approval.reviewReported?.sourceSharingPermissionsConfirmed!==true||
   approval.limits?.otherQuestionsApproved!==false||approval.limits?.newTextRevisionsApproved!==false||approval.limits?.officialAnswerKey!==false||
   !Array.isArray(approval.bindings)||JSON.stringify(approval.bindings.map(b=>b.number))!==JSON.stringify(prepared.numbers))fail('IMPORTED_SHARING_APPROVAL_REQUIRED');
 if(authorization?.schema!=='egel-user-publication-authorization-v1'||authorization.recordedVia!=='direct-user-chat'||
   authorization.migrationAuthorized!==true||authorization.publicationAuthorized!==true||authorization.sharingApprovalSha256!==digest(approval)||
   JSON.stringify(authorization.numbers)!==JSON.stringify(prepared.numbers)||JSON.stringify(prepared.numbers)!==JSON.stringify(['001','003','006']))fail('IMPORTED_PUBLICATION_AUTHORIZATION_REQUIRED');
 const contentApprovalSha256=digest(approval),publicationAuthorizationSha256=digest(authorization);
 const records=prepared.records.map(r=>{
   const b=approval.bindings.find(b=>b.number===r.number);
   if(b.questionId!==r.question.id||b.questionVersion!==r.question.version||b.questionSha256!==r.provenance.questionSha256||
     b.bodySha256!==r.editorial.sha256||b.sourcesSha256!==digest(r.sources)||b.preparationSha256!==r.preparationSha256||b.sourceCount!==r.sources.length)fail('IMPORTED_SHARING_APPROVAL_CHANGED');
   const sources=r.sources.map(s=>({reference_id:s.referenceId,title:s.title,url:s.url,review_scope:s.scope,review_method:s.read,license:s.license,permission_confirmed:true}));
   const registrationKey=digest({preparation:r.preparationSha256,contentApprovalSha256,publicationAuthorizationSha256,reviewerId});
   return {question:r.question,body:r.editorial.markdown,bodySha256:r.editorial.sha256,sources,registrationKey,
     provenance:{kind:'imported-chat-editorial',provider_verified:null,model_verified:null,source_batch_sha256:r.provenance.sourceBatchId,
       source_record_sha256:r.provenance.sourceRecordSha256,source_packet_sha256:r.provenance.sourcePacketSha256,
       preparation_sha256:r.preparationSha256,content_approval_sha256:contentApprovalSha256,publication_authorization_sha256:publicationAuthorizationSha256}};
 });
 const payload={records,reviewerId,note:'User reviewed content and sharing permissions in chat; explicit separate authorization to apply migration and publish only 001, 003, 006. Approval SHA256 '+contentApprovalSha256+'; publication authorization SHA256 '+publicationAuthorizationSha256};
 const planSha256=digest(payload),tag='$egel_import_'+planSha256.slice(0,20)+'$',outer='$egel_publish_'+planSha256.slice(0,20)+'$';
 const encoded=JSON.stringify(payload);if(encoded.includes(tag)||encoded.includes(outer))fail('IMPORTED_SQL_DELIMITER_CONFLICT');
 const query=`do ${outer}
declare p jsonb := ${tag}${encoded}${tag}::jsonb; r jsonb;q public.questions;b public.tutor_imported_editorials;
begin
 for r in select value from jsonb_array_elements(p->'records') order by value->'question'->>'id' loop
   perform pg_advisory_xact_lock(hashtextextended('imported-editorial:'||(r->'question'->>'id')||':'||(r->'question'->>'version'),0));
   select * into strict q from public.questions where id=r->'question'->>'id' and version=(r->'question'->>'version')::smallint for share;
   if q.stem is distinct from r->'question'->>'stem' or
     (select jsonb_agg(jsonb_build_object('letter',o->>'letter','text',o->>'text') order by n) from jsonb_array_elements(q.options) with ordinality x(o,n)) is distinct from r->'question'->'options'
     then raise exception 'IMPORTED_LIVE_QUESTION_CHANGED';end if;
   if encode(sha256(convert_to(r->>'body','UTF8')),'hex') is distinct from r->>'bodySha256' then raise exception 'IMPORTED_BODY_CHANGED';end if;
   select * into b from public.tutor_imported_editorials where registration_key=r->>'registrationKey' for update;
   if not found then
     insert into public.tutor_imported_editorials(question_id,question_version,body,sources,provenance,registration_key)
     values(q.id,q.version,r->>'body',r->'sources',r->'provenance',r->>'registrationKey') returning * into b;
   end if;
   if b.question_id<>q.id or b.question_version<>q.version or b.question_stem is distinct from q.stem or b.question_options is distinct from q.options
     or b.body is distinct from r->>'body' or b.sources is distinct from r->'sources' or b.provenance is distinct from r->'provenance'
     then raise exception 'IMPORTED_EXISTING_CONFLICT';end if;
   if b.status='draft' then
     perform public.publish_imported_editorial(b.id,b.payload_sha256,(p->>'reviewerId')::uuid,p->>'note',true);
   elsif b.status<>'published' or b.reviewer_id is distinct from (p->>'reviewerId')::uuid or b.review_note is distinct from p->>'note' or b.valid_until<=now()
     then raise exception 'IMPORTED_PUBLICATION_CONFLICT';end if;
 end loop;
end; ${outer};
select question_id,status,payload_sha256,reviewed_at,valid_until from public.tutor_imported_editorials
where registration_key in (${records.map(r=>"'"+r.registrationKey+"'").join(',')}) order by question_id;`;
 return {query,planSha256,contentApprovalSha256,publicationAuthorizationSha256,plan:{numbers:prepared.numbers,publish:true,newModelCalls:0,studentWrites:0},payload};
}
