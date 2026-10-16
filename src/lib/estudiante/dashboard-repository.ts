import "server-only";
import { createClient } from "@/lib/supabase/server";
import { BANK_ID } from "@/lib/estudio/domain";
import { unavailableStats, type DashboardStats } from "./dashboard";

/** Server-only. Called with the own profile returned by authenticateStudent, never request input.
 * Session client + explicit owner filters + existing RLS. No privileged key or shared cache.
 */
export async function readStudentDashboard(userId: string): Promise<DashboardStats> {
  try {
    const db = await createClient();
    const countOptions = { head: true, count: "exact" as const };
    const results = await Promise.allSettled([
      db.from("questions").select("id", countOptions).eq("bank_id", BANK_ID),
      // Count parent questions, not attempts: !inner tests existence of an own answer.
      // The existing composite FK also matches the current question_version.
      db.from("questions").select("id,question_attempts!inner(user_id)", countOptions)
        .eq("bank_id", BANK_ID).eq("question_attempts.user_id", userId),
      db.from("questions").select("id,study_notes!inner(user_id)", countOptions)
        .eq("bank_id", BANK_ID).eq("study_notes.user_id", userId),
      db.from("questions").select("id,study_notes!inner(user_id)", countOptions)
        .eq("bank_id", BANK_ID).eq("study_notes.user_id", userId).eq("study_notes.favorite", true),
    ]);
    const counts = results.map(result => {
      if (result.status !== "fulfilled" || result.value.error) return null;
      const count = result.value.count;
      return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
    });
    return { total: counts[0], answered: counts[1], notes: counts[2], favorites: counts[3] };
  } catch { return { ...unavailableStats }; }
}
