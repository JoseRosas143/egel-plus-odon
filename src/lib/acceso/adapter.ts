import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnvironment } from "@/lib/supabase/environment";
import type { AuthAdapter } from "./domain";

/** Request-scoped cookie adapter for Route Handlers, never a shared singleton. */
export function createRequestAuth(request: NextRequest): AuthAdapter {
  const { url, publishableKey } = getSupabaseEnvironment();
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const cacheHeaders = new Headers();
  const supabase = createServerClient(url, publishableKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers = {}) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          pending.set(`${cookie.name}:${cookie.options.path ?? "/"}`, cookie);
        }
        for (const [name, value] of Object.entries(headers)) {
          if (["cache-control", "pragma", "expires"].includes(name.toLowerCase())) cacheHeaders.set(name, value);
        }
      },
    },
  });
  return {
    async login(data) {
      const result = await supabase.auth.signInWithPassword(data);
      return { error: result.error, signedIn: Boolean(result.data.session) };
    },
    async signup(data, redirectTo) {
      const result = await supabase.auth.signUp({
        email: data.email, password: data.password,
        options: { data: { display_name: data.display_name }, emailRedirectTo: redirectTo },
      });
      return { error: result.error, signedIn: Boolean(result.data.session) };
    },
    async logout() { return supabase.auth.signOut({ scope: "local" }); },
    async session() {
      const result = await supabase.auth.getUser();
      const user = result.data.user;
      const error = result.error?.name === "AuthSessionMissingError"
        ? { code: "session_not_found", status: 401 } : result.error;
      return { error, user: user && !user.is_anonymous ? { id: user.id, email: user.email ?? null } : null };
    },
    async exchange(code, flowId) {
      const result = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      return { error: result.error, signedIn: Boolean(result.data.session) };
    },
    respond(response) {
      const out = new NextResponse(response.body, { status: response.status, headers: response.headers });
      for (const cookie of pending.values()) out.cookies.set(cookie.name, cookie.value, cookie.options);
      cacheHeaders.forEach((value, name) => out.headers.set(name, value));
      out.headers.set("Cache-Control", "private, no-store, max-age=0");
      out.headers.set("Pragma", "no-cache");
      out.headers.set("Expires", "0");
      out.headers.set("Vary", "Cookie");
      out.headers.set("Referrer-Policy", "no-referrer");
      out.headers.set("X-Content-Type-Options", "nosniff");
      return out;
    },
  };
}
