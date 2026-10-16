import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import catalog from "./catalog.json";
import { pdfRange } from "./domain";

const checked = new Map<string, string>();
export async function libraryPdf(id: string, request: Request): Promise<Response> {
  const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" });
  const fail = (status: number, code: string) => Response.json({ ok: false, error: code }, { status, headers });
  if (!/^BIB-\d{3}$/.test(id)) return fail(404, "BOOK_NOT_FOUND");
  const book = catalog.find(b => b.id === id);
  if (!book) return fail(404, "BOOK_NOT_FOUND");
  const configured = process.env.EGEL_LIBRARY_ROOT;
  if (!configured) return fail(503, "LOCAL_LIBRARY_NOT_CONFIGURED");
  try {
    const root = await fs.realpath(configured);
    const real = await fs.realpath(path.join(root, book.filename));
    const relative = path.relative(root, real);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return fail(503, "LIBRARY_FILE_UNAVAILABLE");
    const handle = await fs.open(real, "r");
    let streaming = false;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== book.bytes) return fail(503, "LIBRARY_FILE_CHANGED");
      const fingerprint = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      if (checked.get(book.id) !== fingerprint) {
        const hash = createHash("sha256");
        for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) hash.update(chunk);
        if (hash.digest("hex") !== book.sha256) return fail(503, "LIBRARY_FILE_CHANGED");
        checked.set(book.id, fingerprint);
      }
      headers.set("Content-Type", "application/pdf");
      headers.set("Content-Disposition", `inline; filename="${book.id}.pdf"`);
      headers.set("Accept-Ranges", "bytes");
      const rangeHeader = request.headers.get("range");
      const range = pdfRange(rangeHeader, stat.size);
      if (!range) { headers.set("Content-Range", `bytes */${stat.size}`); return new Response(null, { status: 416, headers }); }
      headers.set("Content-Length", String(range.end - range.start + 1));
      if (rangeHeader) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
      if (request.method === "HEAD") return new Response(null, { status: rangeHeader ? 206 : 200, headers });
      const stream = handle.createReadStream({ start: range.start, end: range.end, autoClose: true });
      streaming = true;
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: rangeHeader ? 206 : 200, headers });
    } finally { if (!streaming) await handle.close(); }
  } catch { return fail(503, "LIBRARY_FILE_UNAVAILABLE"); }
}
