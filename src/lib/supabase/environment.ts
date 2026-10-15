/** Configuracion del proyecto Egel. No contiene ninguna clave real. */
export const EXPECTED_SUPABASE_URL =
  "https://zbfgcfajiwhfhewkstvi.supabase.co";

export type SupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

export type ConfigurationResult =
  | { ok: true; value: SupabaseEnvironment }
  | { ok: false; code: string; message: string };

/** Funcion pura: valida sin imprimir los valores recibidos. */
export function validateSupabaseEnvironment(
  rawUrl: string | undefined,
  rawKey: string | undefined,
): ConfigurationResult {
  const url = rawUrl?.trim().replace(/\/+$/, "");
  const publishableKey = rawKey?.trim();

  if (!url || !publishableKey) {
    return {
      ok: false,
      code: "MISSING_CONFIGURATION",
      message: "Faltan variables de Supabase en .env.local.",
    };
  }

  // Comparacion exacta antes de cualquier solicitud: evita otra cuenta o SSRF.
  if (url !== EXPECTED_SUPABASE_URL) {
    return {
      ok: false,
      code: "WRONG_PROJECT",
      message: "La URL no corresponde al proyecto Egel.",
    };
  }

  // En este proyecto nuevo usamos la clave publicable, no JWT anon ni secretos.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    return {
      ok: false,
      code: "INVALID_PUBLIC_KEY",
      message: "Usa la clave publicable de Egel; nunca una clave administrativa.",
    };
  }

  return { ok: true, value: { url, publishableKey } };
}

export function getSupabaseEnvironment(): SupabaseEnvironment {
  // Accesos estaticos: Next.js puede sustituir estas variables en el navegador.
  // No se leen al importar el modulo; no se requiere .env durante la importacion.
  const result = validateSupabaseEnvironment(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
