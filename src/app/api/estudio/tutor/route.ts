import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BANK_ID, StudyError, type Question } from "@/lib/estudio/domain";
import { handleTutor } from "@/lib/tutor/handler";
import { tutorConfig } from "@/lib/tutor/gemini";
import { SHARED_BASE_PROMPT_VERSIONS, selectSharedBase } from "@/lib/tutor/shared-base";
import { TutorError } from "@/lib/tutor/domain";
import { IMPORTED_EDITORIAL_IDS, selectImportedEditorial } from "@/lib/tutor/imported-base";

async function access() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) return null;
  const uid = data.user.id;
  return { uid,
    async sharedBase(q: Question) {
      if (IMPORTED_EDITORIAL_IDS.includes(q.id)) {
        const imported = await db.from("tutor_imported_editorials").select("id,format_version,body,citations,reviewed_at,valid_until")
          .eq("question_id", q.id).eq("question_version", q.version).limit(2);
        if (imported.error) throw new TutorError("TUTOR_BASE_UNAVAILABLE", 503);
        const message = selectImportedEditorial(imported.data, q.id);
        if (message) return message;
      }
      const r = await db.from("tutor_base_explanations").select("id,model,prompt_version,editorial_revision,body,citations,reviewed_at")
        .eq("question_id",q.id).eq("question_version",q.version).in("prompt_version",SHARED_BASE_PROMPT_VERSIONS).limit(4);
      if (r.error) throw new TutorError("TUTOR_BASE_UNAVAILABLE",503);
      return selectSharedBase(r.data);
    },
    async question(id: string) {
      const r = await db.from("questions").select("id,bank_id,position,version,source_number,stem,options,source_pages,review_flags,evidence_eligible,scoreable").eq("bank_id",BANK_ID).eq("id",id).maybeSingle<Question>();
      if (r.error) throw new StudyError("DATABASE_UNAVAILABLE",503);
      return r.data;
    },
    async answered(q: Question) {
      const r = await db.from("question_attempts").select("request_id").eq("user_id",uid).eq("question_id",q.id).eq("question_version",q.version).limit(1);
      if (r.error) throw new StudyError("DATABASE_UNAVAILABLE",503);
      return !!r.data?.length;
    },
  };
}
export async function GET(request: Request) { await connection(); return handleTutor(request,access,tutorConfig()); }
export async function POST(request: Request) { await connection(); return handleTutor(request,access,tutorConfig()); }
