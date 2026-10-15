import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Solo rutas previstas para autenticacion/datos privados. El diagnostico y
  // la portada quedan fuera. Ampliar explicitamente al crear nuevos modulos.
  matcher: [
    "/login/:path*",
    "/registro/:path*",
    "/auth/:path*",
    "/estudio/:path*",
    "/cuenta/:path*",
    "/api/estudiante/:path*",
  ],
};
