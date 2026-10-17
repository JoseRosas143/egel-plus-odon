import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BANK_ID, StudyError, type Question } from "@/lib/estudio/domain";
import { handleOpinion } from "@/lib/tutor/opinion-handler";
import { opinionPilotRoot } from "@/lib/tutor/opinion-pilot";

async function access() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) return null;
  const uid = data.user.id;
  return { uid,
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
export async function GET(request: Request) { await connection(); return handleOpinion(request,access,opinionPilotRoot()); }
