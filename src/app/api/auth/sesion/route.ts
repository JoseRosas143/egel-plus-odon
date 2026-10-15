import { connection, type NextRequest } from "next/server";
import { createRequestAuth } from "@/lib/acceso/adapter";
import { handleSession } from "@/lib/acceso/handlers";

export async function GET(request: NextRequest) {
  await connection();
  return handleSession(() => createRequestAuth(request));
}
