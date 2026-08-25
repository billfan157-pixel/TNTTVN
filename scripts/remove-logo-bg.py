#!/usr/bin/env python3
"""
Xóa nền vàng ngoài viền tròn logo Xứ đoàn Gia Tôn -> PNG nền trong suốt.
Cách dùng:
  python scripts/remove-logo-bg.py input.jpg [output.png]
  - input: file gốc (jpg/png) có nền vàng
  - output: file PNG trong suốt (mặc định: <input>-transparent.png)

Thuật toán: tạo mặt nạ tròn + feather 1.5px, chỉ giữ phần trong vòng tròn xanh đậm.
Không xóa màu vàng bên trong logo (các nhân vật).
Yêu cầu: pip install pillow
"""
import sys
import math
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Thiếu Pillow. Cài: pip install pillow")
    sys.exit(1)

def remove_background(input_path: str, output_path: str | None = None, feather: float = 2.0):
    p = Path(input_path)
    if not p.exists():
        print(f"Không tìm thấy file: {p.resolve()}")
        sys.exit(1)

    if output_path is None:
        output_path = str(p.with_name(p.stem + "-transparent.png"))
    out = Path(output_path)

    img = Image.open(p).convert("RGBA")
    w, h = img.size
    cx, cy = w / 2, h / 2
    # Bán kính = 49.2% cạnh ngắn (chừa viền xanh đậm ~ 1.5% + antialias)
    # Logo là hình tròn hoàn hảo, viền xanh đậm nằm sát mép
    radius = min(w, h) * 0.492
    # Feather để mép không răng cưa
    feather = max(1.0, feather)

    # Tạo alpha mask
    mask = Image.new("L", (w, h), 0)
    mask_px = mask.load()
    # Lặp pixel (tối ưu: vector hóa bằng putdata nếu ảnh lớn, nhưng logo ~600px nên loop ok)
    for y in range(h):
        dy = y - cy
        for x in range(w):
            dx = x - cx
            dist = math.hypot(dx, dy)
            if dist <= radius - feather:
                a = 255
            elif dist >= radius + 0.5:
                a = 0
            else:
                # feather tuyến tính
                t = (radius + 0.5 - dist) / (feather + 0.5)
                t = max(0.0, min(1.0, t))
                a = int(t * 255)
            mask_px[x, y] = a

    # Áp mask vào kênh alpha (nhân với alpha gốc nếu có)
    r, g, b, a = img.split()
    # Nhân alpha gốc với mask
    new_alpha = Image.new("L", (w, h))
    for y in range(h):
        for x in range(w):
            new_alpha.putpixel((x, y), (a.getpixel((x, y)) * mask.getpixel((x, y))) // 255)

    img.putalpha(new_alpha)
    # Cắt padding trong suốt thừa (optional) - giữ nguyên để không lệch tâm
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    print(f"OK -> {out.resolve()} ({w}x{h}, radius={radius:.1f}px, feather={feather}px)")
    print("Dùng làm logo: copy vào src/assets/logo-xu-doan.png hoặc thay src/assets/logo-tntt.png")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    fe = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    remove_background(inp, out, fe)
