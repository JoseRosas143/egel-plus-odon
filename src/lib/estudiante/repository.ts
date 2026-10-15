import { createClient } from "@/lib/supabase/server";
import type { AuthResult, Profile, StudyPreferences } from "./domain";

const profileFields = "user_id,display_name,timezone,created_at,updated_at";
const preferenceFields = "user_id,daily_goal_minutes,exam_date,preferred_mode,theme,created_at,updated_at";

/** Solo servidor: usa la sesion de la solicitud. Nunca service_role ni estado global. */
export async function authenticateStudent(): Promise<AuthResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const unauthenticated = [400, 401, 403].includes(error.status ?? 0)
        || error.name === "AuthSessionMissingError";
      return unauthenticated
        ? { ok: false, code: "AUTH_REQUIRED", status: 401 }
        : { ok: false, code: "AUTH_UNAVAILABLE", status: 503 };
    }
    const user = data.user;
    if (!user || user.is_anonymous) return { ok: false, code: "AUTH_REQUIRED", status: 401 };
    const userId = user.id;
    return {
      ok: true,
      repository: {
        profile: {
          async read() {
            const result = await supabase.from("profiles").select(profileFields).eq("user_id", userId).maybeSingle<Profile>();
            return { data: result.data, failed: result.error !== null };
          },
          async update(patch) {
            const result = await supabase.from("profiles").update(patch).eq("user_id", userId).select(profileFields).maybeSingle<Profile>();
            return { data: result.data, failed: result.error !== null };
          },
        },
        preferences: {
          async read() {
            const result = await supabase.from("study_preferences").select(preferenceFields).eq("user_id", userId).maybeSingle<StudyPreferences>();
            return { data: result.data, failed: result.error !== null };
          },
          async update(patch) {
            const result = await supabase.from("study_preferences").update(patch).eq("user_id", userId).select(preferenceFields).maybeSingle<StudyPreferences>();
            return { data: result.data, failed: result.error !== null };
          },
        },
      },
    };
  } catch { return { ok: false, code: "AUTH_UNAVAILABLE", status: 503 }; }
}
