import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnvironment } from "./environment";

function disableSharedCache(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

/**
 * Refresca cookies. NO sustituye guardas de autorizacion ni politicas RLS.
 * Cada pagina/API privada debe verificar getClaims/getUser antes de leer datos.
 */
export async function updateSession(request: NextRequest) {
  let response = disableSharedCache(NextResponse.next({ request }));
  const { url, publishableKey } = getSupabaseEnvironment();

  const supabase = createServerClient(url, publishableKey, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Conservar tambien las cookies de llamadas anteriores a setAll.
        const previousCookies = response.cookies.getAll();
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = disableSharedCache(NextResponse.next({ request }));
        previousCookies.forEach((cookie) => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Verificacion de token; no usar getSession como prueba de identidad.
  // Un visitante sin sesion puede continuar a login/registro.
  await supabase.auth.getClaims();
  return response;
}
