"""
스토어 제출용 아이콘·타일 이미지를 게임 로고에서 한 번에 생성해요.

    python build/make-icons.py

원본은 build/logo-master.png (1080x1080) 한 장이에요.
로고를 바꾸고 싶으면 그 파일만 갈아끼우고 다시 돌리면 됩니다.

Pillow만 있으면 됩니다:  pip install pillow
"""

from __future__ import annotations

import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
APPX = os.path.join(HERE, "appx")
MASTER = os.path.join(HERE, "logo-master.png")

# 가로로 긴 타일의 배경 — 게임 배경색과 같아요.
BG = (5, 6, 15)

# 정사각 타일: 로고를 그대로 줄여요.
SQUARE_ASSETS = {
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square150x150Logo.png": 150,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

# 가로로 긴 타일: 어두운 배경 위에 로고를 가운데 얹어요.
# (정사각 로고를 잡아 늘이면 지구가 찌그러져 보여요)
WIDE_ASSETS = {
    "Wide310x150Logo.png": (310, 150),
    "SplashScreen.png": (620, 300),
}


def load_master() -> Image.Image:
    if not os.path.exists(MASTER):
        raise SystemExit(
            f"로고 원본이 없어요: {MASTER}\n"
            "1080x1080 정사각 PNG를 이 경로에 두고 다시 실행해 주세요."
        )
    return Image.open(MASTER).convert("RGBA")


def square(master: Image.Image, size: int) -> Image.Image:
    """정사각 타일 — 배경이 불투명해야 타일이 깔끔해요."""
    out = Image.new("RGBA", (size, size), BG + (255,))
    out.alpha_composite(master.resize((size, size), Image.LANCZOS))
    return out.convert("RGB")


# 가로 밴드를 어디서 자를지 (0=위, 1=아래).
# 로켓(우상단)과 지구 중심이 함께 들어오도록 살짝 위쪽에서 잘라요.
WIDE_CROP_CENTER = 0.44


def wide(master: Image.Image, w: int, h: int) -> Image.Image:
    """
    가로 타일 — 정사각 로고를 가운데 얹으면 좌우 여백만 커 보여요.
    아트가 우주 배경이라 가장자리까지 이어지므로, 가로 밴드를 잘라 꽉 채웁니다.
    """
    src = master.convert("RGB")
    sw, sh = src.size

    band_h = int(round(sw * h / w))          # 목표 비율에 맞는 밴드 높이
    if band_h > sh:                          # 원본보다 높으면 가로를 줄여 맞춰요
        band_h = sh
        band_w = int(round(sh * w / h))
        left = (sw - band_w) // 2
        box = (left, 0, left + band_w, sh)
    else:
        top = int(round((sh - band_h) * WIDE_CROP_CENTER))
        top = max(0, min(sh - band_h, top))
        box = (0, top, sw, top + band_h)

    return src.crop(box).resize((w, h), Image.LANCZOS)


def main() -> None:
    os.makedirs(APPX, exist_ok=True)
    master = load_master()

    # 창 아이콘 · 실행 파일 아이콘
    square(master, 512).save(os.path.join(HERE, "icon.png"))
    square(master, 256).save(
        os.path.join(HERE, "icon.ico"),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    for name, size in SQUARE_ASSETS.items():
        square(master, size).save(os.path.join(APPX, name))

    for name, (w, h) in WIDE_ASSETS.items():
        wide(master, w, h).save(os.path.join(APPX, name))

    total = len(SQUARE_ASSETS) + len(WIDE_ASSETS)
    print(f"icon.png / icon.ico + appx 타일 {total}장 생성 완료 (원본: logo-master.png)")


if __name__ == "__main__":
    main()
