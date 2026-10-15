import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnvironment } from "./environment";

/**
 * Instancia por solicitud, nunca global ni dentro de "use cache".
 * En Server Components, setAll no puede escribir; src/proxy.ts refresca cookies.
 * En Server Actions y Route Handlers las cookies si pueden escribirse.
 */
export async function createClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Patron SSR: la escritura puede venir de un Server Component.
          // Solo es correcto junto al Proxy que refresca la sesion.
        }
      },
    },
  });
}
