#!/usr/bin/env python3
"""生成 EFF AI 助手插件图标(纯标准库,逐像素渲染 + 盒式降采样)。"""
import math
import struct
import sys
import zlib
from pathlib import Path

SS = 512  # 超采样边长
OUT_DIR = Path(__file__).resolve().parent.parent / "icons"


def lerp(a, b, t):
    return a + (b - a) * t


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


C1 = hex2rgb("6366f1")  # indigo
C2 = hex2rgb("a855f7")  # violet
WHITE = (255, 255, 255)


def rounded_rect_sd(x, y, cx, cy, hw, hh, r):
    """有符号距离:点(x,y)到圆角矩形的距离,负数在内部。"""
    dx = abs(x - cx) - (hw - r)
    dy = abs(y - cy) - (hh - r)
    ax, ay = max(dx, 0.0), max(dy, 0.0)
    return math.hypot(ax, ay) + min(max(dx, dy), 0.0) - r


def spark_sd(x, y, cx, cy, size, p=0.45):
    """四角星(凹菱形)有符号距离,|dx|^p+|dy|^p<=size^p 内部。"""
    dx, dy = x - cx, y - cy
    return (abs(dx) ** p + abs(dy) ** p) ** (1.0 / p) - size


def render(size_ss):
    px = [[(0, 0, 0, 0)] * size_ss for _ in range(size_ss)]
    c = size_ss / 2.0
    hw = hh = c * 0.94
    rad = c * 0.24

    # 主火花:中心四角星
    spark1 = (c, c, c * 0.52)
    # 副火花:右上小四角星
    spark2 = (c + c * 0.52, c - c * 0.52, c * 0.17)

    for j in range(size_ss):
        for i in range(size_ss):
            # 像素中心采样
            x, y = i + 0.5, j + 0.5
            d_bg = rounded_rect_sd(x, y, c, c, hw, hh, rad)
            if d_bg >= 1.0:
                continue
            # 垂直渐变
            t = (y - (c - hw)) / (2 * hw)
            col = tuple(int(lerp(C1[k], C2[k], t)) for k in range(3))
            # 星形(边缘 1px 抗锯齿)
            d1 = spark_sd(x, y, *spark1)
            d2 = spark_sd(x, y, *spark2)
            a1 = max(0.0, min(1.0, 0.5 - d1))
            a2 = max(0.0, min(1.0, 0.5 - d2))
            a = max(a1, a2)
            if a > 0:
                col = tuple(int(lerp(col[k], WHITE[k], a)) for k in range(3))
            # 背景边缘抗锯齿
            bg_a = max(0.0, min(1.0, 0.5 - d_bg))
            px[j][i] = (*col, int(255 * bg_a))
    return px


def downsample(px, src, dst):
    """盒式滤波降采样。"""
    step = src // dst
    out = []
    for j in range(dst):
        row = []
        for i in range(dst):
            r = g = b = a = n = 0
            for jj in range(j * step, (j + 1) * step):
                for ii in range(i * step, (i + 1) * step):
                    pr, pg, pb, pa = px[jj][ii]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
                    n += 1
            if a == 0:
                row.append((0, 0, 0, 0))
            else:
                row.append((round(r / a), round(g / a), round(b / a), round(a / n)))
        out.append(row)
    return out


def write_png(path, px):
    h = len(px)
    w = len(px[0])
    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *p) for p in row)
        for row in px
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"  {path.name}: {w}x{h}, {len(png)} bytes")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"渲染 {SS}x{SS} 超采样图…")
    big = render(SS)
    for size in (128, 48, 32, 16):
        print(f"降采样至 {size}x{size}…")
        small = downsample(big, SS, size)
        write_png(OUT_DIR / f"icon{size}.png", small)
    print("完成。")


if __name__ == "__main__":
    sys.exit(main())
