"""
로딩 화면 배경 — 로고 일러스트를 세로 화면에 **꽉 채워서** 만들어요.

    python scripts/make-loading-art.py

원본은 정사각(1080x1080)이고 화면은 세로로 긴 비율(약 0.46)이라,
꽉 채우려면 좌우를 잘라내는 수밖에 없어요. 그래서 지구와 로켓이 모두 남도록
크롭 중심을 오른쪽으로 조금 밀어 뒀어요. (CROP_CENTER_X)

위아래로 어두운 띠를 두지 않아요. 대신 아래쪽에 **아주 옅은** 그라디언트만 얹어
제목·버튼이 읽히게 합니다. (화면이 위아래로 갈린 것처럼 보이면 안 돼요)

원본보다 크게 늘려야 해서 조금 흐려지는 건 어쩔 수 없어요.
LANCZOS로 늘린 뒤 언샵 마스크로 최대한 살립니다.
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SRC = os.path.join(ROOT, "msbuild", "build", "logo-master.png")
OUT = os.path.join(ROOT, "src", "loading-bg.jpg")

# 3배 화면(약 1206px 폭)을 감당하면서 용량도 감당되는 선
W, H = 900, 1950

# 좌우를 자를 때 어디를 중심으로 둘지 (0=왼쪽 끝, 1=오른쪽 끝)
# 0.5~0.6이면 로켓 몸통이 잘려요. 0.75가 지구·로켓·소행성 고리가 모두 살아요.
CROP_CENTER_X = 0.75

BG = (5, 6, 15)


def cover(art: Image.Image) -> Image.Image:
    """세로 화면을 꽉 채우도록 늘리고 좌우를 잘라내요."""
    scale = max(W / art.width, H / art.height)
    big = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)

    max_left = big.width - W
    left = round(max_left * CROP_CENTER_X)
    left = max(0, min(max_left, left))
    top = max(0, (big.height - H) // 2)
    return big.crop((left, top, left + W, top + H))


def bottom_veil(canvas: Image.Image) -> None:
    """
    제목·버튼이 읽힐 만큼만 아래를 눌러요.
    진하게 덮으면 화면이 위아래로 갈린 것처럼 보여서, 아주 옅게 시작해
    맨 아래에서만 짙어지게 합니다.
    """
    veil = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(veil)
    start = int(H * 0.38)
    for y in range(start, H):
        t = (y - start) / (H - start)
        d.line([(0, y), (W, y)], fill=BG + (min(246, int(246 * t**1.45)),))
    canvas.alpha_composite(veil)


def main() -> None:
    if not os.path.exists(SRC):
        raise SystemExit(f"원본 로고가 없어요: {SRC}")

    art = Image.open(SRC).convert("RGB")
    canvas = cover(art)

    # 크게 늘리면서 무뎌진 윤곽을 살짝 되살려요
    canvas = canvas.filter(ImageFilter.UnsharpMask(radius=2.2, percent=95, threshold=3))

    canvas = canvas.convert("RGBA")
    bottom_veil(canvas)

    canvas.convert("RGB").save(OUT, quality=72, optimize=True, progressive=True)
    sys.stdout.write(f"{os.path.relpath(OUT, ROOT)}  {W}x{H}  {os.path.getsize(OUT)/1024:.0f} KB\n")


if __name__ == "__main__":
    main()
