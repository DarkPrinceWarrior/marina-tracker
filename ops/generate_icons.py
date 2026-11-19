#!/usr/bin/env python3
"""Generate brand-accurate 2026 Carbon & Cobalt PWA PNG & SVG icons for «Ритм».

Pure Python standard library (zero Pillow/Cairo dependencies) using analytic
signed-distance-field (SDF) anti-aliasing:
  - Background: sleek studio Carbon (#27272A -> #18181B -> #111318)
  - Outer rhythm arc: crisp pure white (#FFFFFF)
  - Inner rhythm arc: vibrant Cobalt (#3B82F6 -> #2563EB)
  - Zenith accent dot: restrained Coral (#FF335F)

Outputs into public/icons/:
  - apple-touch-icon.png  (180x180, full-bleed square for iOS squircle mask)
  - icon-192.png          (192x192)
  - icon-512.png          (512x512)
  - icon-512-maskable.png (512x512, >= 21% safe padding on all sides)
  - icon.svg              (scalable vector favicon matching the PNG icons)
"""

from __future__ import annotations

import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "icons"

# 2026 Carbon & Cobalt studio palette
BG_LIGHT = (39.0, 39.0, 42.0)      # #27272A subtle top-left studio sheen
BG_MID = (24.0, 24.0, 27.0)        # #18181B core Carbon
BG_DEEP = (17.0, 19.0, 24.0)       # #111318 deep Graphite edge
WHITE = (255.0, 255.0, 255.0)      # #FFFFFF outer trajectory arc
COBALT = (59.0, 130.0, 246.0)      # #3B82F6 luminous Cobalt inner arc
COBALT_DEEP = (37.0, 99.0, 235.0)  # #2563EB deep Cobalt core
CORAL = (255.0, 51.0, 95.0)        # #FF335F restrained Coral zenith dot
CORAL_HI = (255.0, 107.0, 138.0)   # #FF6B8A soft highlight on zenith dot


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return lo if v < lo else (hi if v > hi else v)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def blend_rgb(
    bg: tuple[float, float, float],
    fg: tuple[float, float, float],
    alpha: float,
) -> tuple[float, float, float]:
    if alpha <= 0.0:
        return bg
    if alpha >= 1.0:
        return fg
    inv = 1.0 - alpha
    return (
        bg[0] * inv + fg[0] * alpha,
        bg[1] * inv + fg[1] * alpha,
        bg[2] * inv + fg[2] * alpha,
    )


def sdf_symmetric_bottom_arc(
    px: float,
    py: float,
    cx: float,
    cy: float,
    radius: float,
    half_span_rad: float,
    half_width: float,
) -> float:
    """Exact Euclidean SDF for a circular arc symmetric around +Y (bottom) with round caps."""
    ux = abs(px - cx)
    uy = py - cy
    theta = math.atan2(ux, uy)
    if theta <= half_span_rad:
        dist = abs(math.hypot(ux, uy) - radius)
    else:
        ex = radius * math.sin(half_span_rad)
        ey = radius * math.cos(half_span_rad)
        dist = math.hypot(ux - ex, uy - ey)
    return dist - half_width


def render_icon_rgb(size: int, maskable: bool = False) -> bytes:
    """Render an RGB scanline buffer (with PNG filter byte 0 per row)."""
    scale = 0.78 if maskable else 1.0
    cx = 0.5
    cy = 0.525

    r_outer = 0.295 * scale
    hw_outer = 0.0285 * scale
    span_outer = math.radians(136.0)

    r_inner = 0.175 * scale
    hw_inner = 0.0255 * scale
    span_inner = math.radians(112.0)

    dot_x = cx
    dot_y = cy - r_outer
    dot_r = 0.056 * scale
    glow_r = 0.145 * scale

    aa = 1.15 / size
    inv_size = 1.0 / size

    raw = bytearray((size * 3 + 1) * size)
    pos = 0

    for y in range(size):
        raw[pos] = 0
        pos += 1
        py = (y + 0.5) * inv_size
        dy_hi = py - 0.20
        dy_dot = py - dot_y

        for x in range(size):
            px = (x + 0.5) * inv_size

            # Crisp two-stop radial Carbon background
            d_hi = math.hypot(px - 0.25, dy_hi)
            t = clamp(d_hi / 1.05, 0.0, 1.0)
            t = t * t * (3.0 - 2.0 * t)
            if t < 0.45:
                k = t / 0.45
                col = (
                    lerp(BG_LIGHT[0], BG_MID[0], k),
                    lerp(BG_LIGHT[1], BG_MID[1], k),
                    lerp(BG_LIGHT[2], BG_MID[2], k),
                )
            else:
                k = (t - 0.45) / 0.55
                col = (
                    lerp(BG_MID[0], BG_DEEP[0], k),
                    lerp(BG_MID[1], BG_DEEP[1], k),
                    lerp(BG_MID[2], BG_DEEP[2], k),
                )

            # Subtle Coral aura behind zenith dot
            d_dot = math.hypot(px - dot_x, dy_dot)
            if d_dot < glow_r:
                g = 1.0 - (d_dot / glow_r)
                col = blend_rgb(col, CORAL, 0.14 * g * g)

            # Outer rhythm arc (pure crisp white)
            sdf_out = sdf_symmetric_bottom_arc(px, py, cx, cy, r_outer, span_outer, hw_outer)
            if sdf_out < aa:
                a_out = clamp(0.5 - sdf_out / aa, 0.0, 1.0) * 0.98
                col = blend_rgb(col, WHITE, a_out)

            # Inner rhythm arc (vibrant Cobalt gradient)
            sdf_in = sdf_symmetric_bottom_arc(px, py, cx, cy, r_inner, span_inner, hw_inner)
            if sdf_in < aa:
                a_in = clamp(0.5 - sdf_in / aa, 0.0, 1.0)
                c_k = clamp((py - (cy - r_inner)) / (2.0 * r_inner), 0.0, 1.0)
                arc_col = (
                    lerp(COBALT[0], COBALT_DEEP[0], c_k),
                    lerp(COBALT[1], COBALT_DEEP[1], c_k),
                    lerp(COBALT[2], COBALT_DEEP[2], c_k),
                )
                col = blend_rgb(col, arc_col, a_in)

            # Zenith Coral dot
            sdf_dot = d_dot - dot_r
            if sdf_dot < aa:
                a_dot = clamp(0.5 - sdf_dot / aa, 0.0, 1.0)
                hi_dist = math.hypot(px - (dot_x - 0.015 * scale), py - (dot_y - 0.016 * scale))
                hi_k = clamp(1.0 - hi_dist / (dot_r * 1.45), 0.0, 1.0)
                dot_col = (
                    lerp(CORAL[0], CORAL_HI[0], hi_k * 0.55),
                    lerp(CORAL[1], CORAL_HI[1], hi_k * 0.55),
                    lerp(CORAL[2], CORAL_HI[2], hi_k * 0.55),
                )
                col = blend_rgb(col, dot_col, a_dot)

            raw[pos] = int(clamp(col[0], 0.0, 255.0) + 0.5)
            raw[pos + 1] = int(clamp(col[1], 0.0, 255.0) + 0.5)
            raw[pos + 2] = int(clamp(col[2], 0.0, 255.0) + 0.5)
            pos += 3

    return bytes(raw)


def encode_png_rgb(width: int, height: int, scanlines: bytes) -> bytes:
    def chunk(tag: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(scanlines, level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )


def build_svg() -> str:
    """Generate matching Carbon & Cobalt SVG favicon (512x512 viewBox)."""
    cx = 256.0
    cy = 268.8

    def arc_path(r: float, half_span_deg: float) -> str:
        rad = math.radians(half_span_deg)
        x1 = cx + r * math.sin(rad)
        y1 = cy + r * math.cos(rad)
        x2 = cx - r * math.sin(rad)
        y2 = cy + r * math.cos(rad)
        large_arc = 1 if half_span_deg > 90.0 else 0
        return f"M {x1:.2f} {y1:.2f} A {r:.2f} {r:.2f} 0 {large_arc} 1 {x2:.2f} {y2:.2f}"

    outer_d = arc_path(151.04, 136.0)
    inner_d = arc_path(89.60, 112.0)
    dot_y = cy - 151.04

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Ритм">
  <defs>
    <radialGradient id="ritm-bg" cx="25%" cy="20%" r="95%">
      <stop offset="0%" stop-color="#27272A"/>
      <stop offset="46%" stop-color="#18181B"/>
      <stop offset="100%" stop-color="#111318"/>
    </radialGradient>
    <linearGradient id="ritm-cobalt" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
    <radialGradient id="ritm-dot" cx="35%" cy="32%" r="70%">
      <stop offset="0%" stop-color="#FF6B8A"/>
      <stop offset="100%" stop-color="#FF335F"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#ritm-bg)"/>
  <path d="{outer_d}" fill="none" stroke="#FFFFFF" stroke-opacity="0.98" stroke-width="29.2" stroke-linecap="round"/>
  <path d="{inner_d}" fill="none" stroke="url(#ritm-cobalt)" stroke-width="26.1" stroke-linecap="round"/>
  <circle cx="{cx:.2f}" cy="{dot_y:.2f}" r="28.7" fill="url(#ritm-dot)"/>
</svg>
"""


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    targets = [
        ("apple-touch-icon.png", 180, False),
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-512-maskable.png", 512, True),
    ]

    for filename, size, maskable in targets:
        scanlines = render_icon_rgb(size, maskable=maskable)
        png_bytes = encode_png_rgb(size, size, scanlines)
        out_path = OUT_DIR / filename
        out_path.write_bytes(png_bytes)
        print(f"Generated {out_path.relative_to(ROOT)} ({size}x{size}, {len(png_bytes)} bytes)")

    svg_path = OUT_DIR / "icon.svg"
    svg_text = build_svg()
    svg_path.write_text(svg_text, encoding="utf-8")
    print(f"Generated {svg_path.relative_to(ROOT)} ({len(svg_text)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
