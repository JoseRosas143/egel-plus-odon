"""Render one original PDF page to PNG on stdout, without changing the PDF."""
import sys
import pymupdf

with pymupdf.open(sys.argv[1]) as doc:
    page = int(sys.argv[2]) - 1
    pix = doc[page].get_pixmap(dpi=200, colorspace=pymupdf.csGRAY, alpha=False)
    sys.stdout.buffer.write(pix.tobytes("png"))
