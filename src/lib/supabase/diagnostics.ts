import type { SupabaseEnvironment } from "./environment";

export type DiagnosticResult = {
  httpStatus: number;
  body: {
    ok: boolean;
    service: "supabase-auth";
    status?: number;
    error?: string;
  };
};

/** Consulta publica de solo lectura. No prueba login, tablas ni RLS. */
export async function checkSupabaseAuth(
  config: SupabaseEnvironment,
  fetchImplementation: typeof fetch = fetch,
): Promise<DiagnosticResult> {
  try {
    const response = await fetchImplementation(`${config.url}/auth/v1/settings`, {
      method: "GET",
      headers: { apikey: config.publishableKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });

    // No reenviar ni registrar el cuerpo remoto, cookies, cabeceras o claves.
    if (response.body) await response.body.cancel();
    return {
      httpStatus: response.ok ? 200 : 502,
      body: {
        ok: response.ok,
        service: "supabase-auth",
        status: response.status,
      },
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return {
      httpStatus: timeout ? 504 : 502,
      body: {
        ok: false,
        service: "supabase-auth",
        error: timeout
          ? "Supabase no respondio dentro del tiempo de espera."
          : "No se pudo contactar con Supabase en esta prueba.",
      },
    };
  }
}
