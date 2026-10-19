"""Read-only PDF extraction; private outputs MUST stay outside the checkout.

No OCR, embeddings, cloud calls, or alteration of source PDFs. A subprocess per
document isolates native parser failures. Graber uses pypdf, not PyMuPDF.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

VERSION = "local-text-v1"


def text_quality(text):
    letters = sum(c.isalpha() for c in text)
    bad = text.count("\ufffd") + len(re.findall(r"\(cid:\d+\)", text))
    if letters < 100:
        return "sparse_or_scanned"
    if bad > max(3, len(text) * 0.005):
        return "encoding_review"
    return "usable_text"


def chunks(text):
    start = 0
    while start < len(text):
        end = min(start + 2400, len(text))
        if end < len(text):
            split = text.rfind(" ", start + 1800, end)
            if split > start:
                end = split
        body = text[start:end]
        if len(body) >= 100:
            yield {"start_char": start, "end_char": end, "body": body,
                   "body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest()}
        if end >= len(text):
            break
        start = end - 180


def extract(pdf, out, fallback=False):
    if fallback:
        from pypdf import PdfReader
        doc = PdfReader(str(pdf), strict=False)
        count = len(doc.pages)
        get_text = lambda i: doc.pages[i].extract_text() or ""
        engine = "pypdf"
    else:
        import pymupdf
        doc = pymupdf.open(str(pdf))
        count = len(doc)
        get_text = lambda i: doc[i].get_text("text", sort=True)
        engine = "pymupdf"
    diagnostics, indexed, ordinal = [], 0, 0
    # A completed marker is written only after the complete private output exists.
    with (out / "chunks.jsonl").open("w", encoding="utf-8") as handle:
        for i in range(count):
            try:
                text = get_text(i).replace("\x00", "")
                text = re.sub(r"[\x01-\x08\x0b\x0e-\x1f]", "", text).strip()
                quality = text_quality(text)
            except Exception:
                text, quality = "", "parser_error"
            diagnostics.append({"pdf_page": i + 1, "chars": len(text), "quality": quality})
            if quality == "usable_text":
                indexed += 1
                for chunk in chunks(text):
                    handle.write(json.dumps({"pdf_page": i + 1, "ordinal": ordinal, **chunk}, ensure_ascii=False) + "\n")
                    ordinal += 1
    result = {"version": VERSION, "engine": engine, "pages": count,
              "indexed_pages": indexed, "pending_pages": count - indexed,
              "chunks": ordinal, "pages_diagnostics": diagnostics,
              "warning": "Text extraction is not OCR or clinical validation; sparse pages may include covers/images."}
    (out / "extraction.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "pages_diagnostics"}), flush=True)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--collection", type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--pdf", type=Path)
    p.add_argument("--fallback", action="store_true")
    args = p.parse_args()
    repo = Path(__file__).resolve().parents[2]
    out = args.output.resolve()
    if out == repo or repo in out.parents:
        raise SystemExit("Private extracted content must be outside the repository")
    out.mkdir(parents=True, exist_ok=True)
    if args.pdf:
        extract(args.pdf, out, args.fallback)
        return
    collection = args.collection.resolve()
    manifest = json.loads((collection / "resultado-final.json").read_text(encoding="utf-8"))
    for item in manifest["mapping"]:
        if item["duplicate_of"]:
            continue
        pdf = (collection / item["canonical_output"]).resolve()
        if collection not in pdf.parents:
            raise SystemExit("Invalid manifest path")
        sha = hashlib.file_digest(pdf.open("rb"), "sha256").hexdigest()
        if sha != item["output_sha256"]:
            raise SystemExit("PDF checksum changed")
        dest = out / sha
        dest.mkdir(exist_ok=True)
        if (dest / "extraction.json").exists():
            print("SKIP", sha[:12], flush=True)
            continue
        fallback = "Graber" in item["source"]
        cmd = [sys.executable, __file__, "--pdf", str(pdf), "--output", str(dest)]
        if fallback:
            cmd.append("--fallback")
        print("EXTRACT", item["source"], flush=True)
        try:
            run = subprocess.run(cmd, timeout=600, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if run.returncode:
                print("FAILED", sha[:12], "parser_exit", run.returncode, flush=True)
            else:
                print(run.stdout.strip(), flush=True)
        except subprocess.TimeoutExpired:
            print("FAILED", sha[:12], "parser_timeout", flush=True)


if __name__ == "__main__":
    main()
