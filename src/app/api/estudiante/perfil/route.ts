import { connection } from "next/server";
import { authenticateStudent } from "@/lib/estudiante/repository";
import { handleRead, handlePatch } from "@/lib/estudiante/handlers";

export async function GET() {
  await connection();
  return handleRead(authenticateStudent, "profile");
}
export async function PATCH(request: Request) {
  await connection();
  return handlePatch(request, authenticateStudent, "profile");
}
