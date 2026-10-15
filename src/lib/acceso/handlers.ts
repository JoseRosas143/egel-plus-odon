import { apiError, BodyError, privateJson, readSmallJson, sameOriginMutation } from "../estudiante/http";
import { classifyAuthError, errorMessage, validateCredentials } from "./domain";
import type { AuthAdapter, AuthMode, CreateAuthAdapter, Registration } from "./domain";

/** No tokens or passwords are returned. Session cookies are applied by the adapter. */
export async function handleAuth(request: Request, mode: AuthMode, createAdapter: CreateAuthAdapter): Promise<Response> {
  let adapter: AuthAdapter | undefined;
  try {
    if (!sameOriginMutation(request)) return apiError("ORIGIN_NOT_ALLOWED", 403);
    const body = await readSmallJson(request);
    if (mode === "salir") {
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
        return apiError("INVALID_INPUT", 400);
      }
      adapter = createAdapter();
      const outcome = await adapter.logout();
      if (outcome.error) {
        const mapped = classifyAuthError(outcome.error);
        return adapter.respond(apiError(mapped.code, mapped.status, errorMessage(mapped.code)));
      }
      return adapter.respond(privateJson({ ok: true, next: "/login" }));
    }
    const input = validateCredentials(body, mode === "registro");
    if (!input.ok) return apiError("INVALID_INPUT", 400, input.message);
    adapter = createAdapter();
    const outcome = mode === "login"
      ? await adapter.login(input.value)
      : await adapter.signup(input.value as Registration, new URL("/auth/callback", request.url).toString());
    if (outcome.error) {
      const mapped = classifyAuthError(outcome.error);
      return adapter.respond(apiError(mapped.code, mapped.status, errorMessage(mapped.code)));
    }
    if (outcome.signedIn) return adapter.respond(privateJson({ ok: true, state: "SIGNED_IN", next: "/cuenta" }));
    if (mode === "registro") {
      // Same response for a pending confirmation and Supabase's obfuscated existing-user response.
      return adapter.respond(privateJson({ ok: true, state: "CHECK_EMAIL" }));
    }
    return adapter.respond(apiError("CREDENTIALS_REJECTED", 401));
  } catch (error) {
    const response = error instanceof BodyError
      ? apiError(error.code, error.status)
      : apiError("AUTH_UNAVAILABLE", 503);
    return adapter ? adapter.respond(response) : response;
  }
}

export async function handleSession(createAdapter: CreateAuthAdapter): Promise<Response> {
  let adapter: AuthAdapter | undefined;
  try {
    adapter = createAdapter();
    const result = await adapter.session();
    if (result.error && ![400, 401, 403].includes(result.error.status ?? 0)) {
      return adapter.respond(apiError("AUTH_UNAVAILABLE", 503));
    }
    if (result.error || !result.user) return adapter.respond(apiError("AUTH_REQUIRED", 401));
    return adapter.respond(privateJson({ ok: true, user: result.user }));
  } catch { return adapter ? adapter.respond(apiError("AUTH_UNAVAILABLE", 503)) : apiError("AUTH_UNAVAILABLE", 503); }
}

function callbackRedirect(request: Request, success: boolean) {
  // Fixed relative target; never use next, redirect_to or error text from a URL.
  const target = new URL(success ? "/cuenta" : "/login?aviso=confirmacion", request.url);
  return new Response(null, { status: 303, headers: {
    Location: target.toString(), "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache", Expires: "0", "Referrer-Policy": "no-referrer",
  } });
}
export async function handleCallback(request: Request, createAdapter: CreateAuthAdapter): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const flowId = params.get("sb_flow_id") ?? undefined;
  if (params.has("error") || params.getAll("code").length !== 1 || !code || code.length > 2048
      || /[\u0000-\u0020]/.test(code) || params.getAll("sb_flow_id").length > 1
      || (flowId !== undefined && (!flowId || flowId.length > 256 || /[\u0000-\u0020]/.test(flowId)))) {
    return callbackRedirect(request, false);
  }
  let adapter: AuthAdapter | undefined;
  try {
    adapter = createAdapter();
    const result = await adapter.exchange(code, flowId);
    return adapter.respond(callbackRedirect(request, !result.error && result.signedIn));
  } catch { return adapter ? adapter.respond(callbackRedirect(request, false)) : callbackRedirect(request, false); }
}
