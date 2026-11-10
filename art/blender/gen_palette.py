"""Palette PNG from src/content/palette3d.json (assets.md §1.2).

Pure Python (zlib + struct): runs under plain `python3` or Blender's Python and
is byte-identical on every run. Never edit the PNG by hand.

    python3 art/blender/gen_palette.py
"""
import json
import os
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "src", "content", "palette3d.json")
OUT = os.path.join(ROOT, "public", "assets", "textures", "palette.png")
GRID = 16
EMPTY = (255, 0, 255)  # unused cells are loud magenta so a bad UV is obvious


def _chunk(tag, data):
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def build():
    with open(SRC, encoding="utf-8") as fh:
        pal = json.load(fh)
    cell = pal["cell"]
    size = GRID * cell
    cells = {}
    for sw in pal["swatches"]:
        pos = (sw["row"], sw["col"])
        if pos in cells:
            raise SystemExit(f"duplicate palette cell {pos}: {sw['key']}")
        h = sw["hex"].lstrip("#")
        cells[pos] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        r = y // cell
        for x in range(size):
            raw.extend(cells.get((r, x // cell), EMPTY))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + _chunk(b"sRGB", b"\x00")
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as fh:
        fh.write(png)
    print(f"palette: {len(cells)} swatches -> {os.path.relpath(OUT, ROOT)} ({len(png)} bytes)")


if __name__ == "__main__":
    build()
