import { connection } from "next/server";
import { validateSupabaseEnvironment } from "@/lib/supabase/environment";
import { checkSupabaseAuth } from "@/lib/supabase/diagnostics";

export async function GET() {
  // Compatible con Cache Components: esperar a una solicitud real.
  await connection();
  const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };

  // No publicar este endpoint de desarrollo en produccion.
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404, headers });
  }

  const config = validateSupabaseEnvironment(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  if (!config.ok) {
    return Response.json(
      { ok: false, code: config.code, error: config.message },
      { status: 500, headers },
    );
  }

  const result = await checkSupabaseAuth(config.value);
  return Response.json(result.body, { status: result.httpStatus, headers });
}
