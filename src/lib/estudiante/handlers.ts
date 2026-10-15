import type { Authenticate } from "./domain";
import { validateProfilePatch, validatePreferencesPatch } from "./domain";
import { apiError, BodyError, privateJson, readSmallJson, sameOriginMutation } from "./http";

type Resource = "profile" | "preferences";
/** El repositorio se crea por solicitud y ya esta restringido al usuario verificado. */
export async function handleRead(authenticate: Authenticate, resource: Resource): Promise<Response> {
  try {
    const auth = await authenticate();
    if (!auth.ok) return apiError(auth.code, auth.status);
    const result = await auth.repository[resource].read();
    if (result.failed) return apiError("DATABASE_UNAVAILABLE", 503);
    if (!result.data) return apiError("STUDENT_DATA_MISSING", 409);
    return privateJson({ ok: true, [resource]: result.data });
  } catch { return apiError("SERVICE_UNAVAILABLE", 503); }
}
export async function handlePatch(request: Request, authenticate: Authenticate, resource: Resource): Promise<Response> {
  try {
    if (!sameOriginMutation(request)) return apiError("ORIGIN_NOT_ALLOWED", 403);
    const auth = await authenticate();
    if (!auth.ok) return apiError(auth.code, auth.status);
    const body = await readSmallJson(request);
    if (resource === "profile") {
      const validation = validateProfilePatch(body);
      if (!validation.ok) return apiError("INVALID_INPUT", 400, validation.message);
      const result = await auth.repository.profile.update(validation.value);
      if (result.failed) return apiError("DATABASE_UNAVAILABLE", 503);
      if (!result.data) return apiError("STUDENT_DATA_MISSING", 409);
      return privateJson({ ok: true, profile: result.data });
    }
    const validation = validatePreferencesPatch(body);
    if (!validation.ok) return apiError("INVALID_INPUT", 400, validation.message);
    const result = await auth.repository.preferences.update(validation.value);
    if (result.failed) return apiError("DATABASE_UNAVAILABLE", 503);
    if (!result.data) return apiError("STUDENT_DATA_MISSING", 409);
    return privateJson({ ok: true, preferences: result.data });
  } catch (error) {
    if (error instanceof BodyError) return apiError(error.code, error.status);
    return apiError("SERVICE_UNAVAILABLE", 503);
  }
}
