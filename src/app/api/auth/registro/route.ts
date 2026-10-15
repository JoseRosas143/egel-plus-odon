import type { NextRequest } from "next/server";
import { createRequestAuth } from "@/lib/acceso/adapter";
import { handleAuth } from "@/lib/acceso/handlers";

export async function POST(request: NextRequest) {
  return handleAuth(request, "registro", () => createRequestAuth(request));
}
