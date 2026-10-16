import { authenticateStudent } from "@/lib/estudiante/repository";
import { libraryPdf } from "@/lib/biblioteca/files";
async function serve(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateStudent();
  if (!auth.ok) return Response.json({ ok: false, error: auth.code }, { status: auth.status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  return libraryPdf((await context.params).id, request);
}
export const GET = serve;
export const HEAD = serve;
