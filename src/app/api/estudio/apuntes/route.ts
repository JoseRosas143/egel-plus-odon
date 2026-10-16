import { connection } from "next/server";
import { authenticateStudy } from "@/lib/estudio/repository";
import { handleStudy } from "@/lib/estudio/handlers";
export async function GET(request:Request){await connection();return handleStudy(request,authenticateStudy,"notes");}
