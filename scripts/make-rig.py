#!/usr/bin/env python3
"""
부위별 움직임용 그림 나누기 (토끼·강아지·돌고래 시범)

원본 그림(src/assets/art/*.webp)은 그대로 두고, 다음을 만들어 src/assets/rig/ 에 저장합니다.
  - {key}-base.webp : 움직일 부위와 눈을 떼어 낸 바탕 그림 (떼어 낸 자리는 주변 색으로 채움)
  - {key}-{part}.webp : 움직일 부위만 남긴 그림 (원본과 같은 크기, 나머지는 투명)
  - {key}-eyes.webp : 눈만 남긴 그림 (깜빡임용)
  - rig.json : 눈 위치·크기·색 (앱이 깜빡일 때 사용)

그림을 다시 그리지 않습니다. 원본 픽셀을 나누기만 하고, 부위가 움직일 때 드러나는
좁은 틈만 주변 색으로 메웁니다.

실행: python3 scripts/make-rig.py   (필요: pillow, numpy, scipy, opencv-python-headless)
"""
import json
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'src', 'assets', 'art')
OUT = os.path.join(ROOT, 'src', 'assets', 'rig')


def load(key):
    return np.array(Image.open(os.path.join(ART, f'{key}.webp')).convert('RGBA'))


def save(arr, name):
    Image.fromarray(arr.astype(np.uint8), 'RGBA').save(os.path.join(OUT, name), 'WEBP', quality=90, alpha_quality=100, method=6)


def grid(shape):
    H, W = shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    return xx / W, yy / H


def fill_hole(img, hole, near_px):
    """구멍(hole) 중 실제 그림 가까이(near_px 안)는 주변 색으로 채우고, 나머지는 투명으로. 구멍 주변만 잘라서 처리."""
    if not hole.any():
        return img.copy()
    ys, xs = np.nonzero(hole)
    pad = int(near_px) * 3 + 8
    y0, y1 = max(0, ys.min() - pad), min(img.shape[0], ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(img.shape[1], xs.max() + 1 + pad)
    out = img.copy()
    out[y0:y1, x0:x1] = _fill_hole(img[y0:y1, x0:x1], hole[y0:y1, x0:x1], near_px)
    return out


def _fill_hole(img, hole, near_px):
    out = img.copy()
    opaque = (img[..., 3] > 200) & ~hole
    # 부위가 덮고 있던 머리·몸 윤곽을 둥글게 이어서(닫힘 연산) 그 안쪽만 채움 → 삐죽한 자리 없이 매끈
    r = int(near_px)
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = (xx * xx + yy * yy) <= r * r
    closed = ndimage.binary_closing(np.pad(opaque, r), structure=disk)[r:-r, r:-r]
    closed = ndimage.binary_opening(closed, structure=disk[::2, ::2])
    fill = hole & closed
    clear = hole & ~fill
    rgb = cv2.cvtColor(img[..., :3].astype(np.uint8), cv2.COLOR_RGB2BGR)
    mask = (hole | (img[..., 3] < 200)).astype(np.uint8) * 255
    painted = cv2.inpaint(rgb, mask, 9, cv2.INPAINT_TELEA)
    painted = cv2.cvtColor(painted, cv2.COLOR_BGR2RGB)
    out[fill, :3] = painted[fill]
    out[fill, 3] = 255
    out[clear] = 0
    return out


def split(img, mask):
    """mask 부분을 떼어 낸 레이어와, 그 자리가 빈 바탕을 돌려줌. 경계 1px은 양쪽에 겹쳐 이음새를 막음."""
    layer = np.zeros_like(img)
    soft = ndimage.binary_dilation(mask, iterations=1)
    layer[soft] = img[soft]
    return layer


def eyes_of(img, centers, r=0.05):
    """눈(진한 점) 찾기 → 눈 레이어, 눈을 지운 마스크, 눈 정보"""
    X, Y = grid(img.shape)
    # 눈은 거의 검은 점: 가장 밝은 채널도 어두워야 함 (보라·갈색 그림자와 구분)
    dark = (img[..., :3].astype(int).max(-1) < 110) & (img[..., 3] > 200)
    allmask = np.zeros(img.shape[:2], bool)
    info = []
    H, W = img.shape[:2]
    for cx, cy in centers:
        near = ((X - cx) ** 2 + (Y - cy) ** 2) < r * r
        lab, n = ndimage.label(dark & near)
        if n == 0:
            raise SystemExit(f'눈을 찾지 못했어요: {cx},{cy}')
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        m = lab == (1 + int(np.argmax(sizes)))
        m = ndimage.binary_fill_holes(m)
        m2 = ndimage.binary_dilation(m, iterations=3)  # 가장자리 번짐까지
        ys, xs = np.nonzero(m)
        col = np.median(img[m][:, :3], axis=0)
        info.append({
            'cx': round(float(xs.mean() / W), 4), 'cy': round(float(ys.mean() / H), 4),
            'rx': round(float((xs.max() - xs.min() + 1) / 2 / W), 4), 'ry': round(float((ys.max() - ys.min() + 1) / 2 / H), 4),
            'color': '#%02x%02x%02x' % tuple(int(c) for c in col),
        })
        allmask |= m2
    layer = np.zeros_like(img)
    layer[allmask] = img[allmask]
    return layer, allmask, info


def make(key, parts, eye_centers):
    img = load(key)
    base = img.copy()
    hole = np.zeros(img.shape[:2], bool)
    boxes = {}
    H, W = img.shape[:2]
    for name, mask, near in parts:
        layer = split(img, mask)
        save(layer, f'{key}-{name}.webp')
        hole |= mask
        ys, xs = np.nonzero(layer[..., 3] > 0)
        m = 4  # 여유 px
        boxes[name] = [round(max(0, xs.min() - m) / W, 4), round(max(0, ys.min() - m) / H, 4),
                       round(min(W, xs.max() + 1 + m) / W, 4), round(min(H, ys.max() + 1 + m) / H, 4)]
    eye_layer, eye_mask, eye_info = eyes_of(img, eye_centers)
    save(eye_layer, f'{key}-eyes.webp')
    # 부위 자리: 그림과 가까운 좁은 틈만 채움 / 눈 자리: 얼굴색으로 채움
    near_px = max([p[2] for p in parts] + [0])
    base = fill_hole(base, hole, near_px) if near_px > 0 else np.where(hole[..., None], 0, base)
    base = fill_hole(base, eye_mask & ~hole, 40)
    if parts:
        save(base, f'{key}-base.webp')
        return {'eyes': eye_info, 'boxes': boxes}
    # 부위가 없으면: 원본 그림 위에 얹을 "눈 자리 덮개"만 (용량 작게)
    cover_mask = ndimage.binary_dilation(eye_mask, iterations=3)
    cover = np.zeros_like(img)
    cover[cover_mask] = base[cover_mask]
    save(cover, f'{key}-cover.webp')
    return {'eyes': eye_info, 'boxes': boxes, 'cover': True}


EYES_ONLY = {
    'apple': [(0.3742, 0.5805), (0.6228, 0.5805)],
    'eggplant': [(0.4052, 0.6344), (0.6226, 0.6345)],
    'banana': [(0.3811, 0.7166), (0.5404, 0.765)],
    'mandarin': [(0.3591, 0.5502), (0.6395, 0.5501)],
    'watermelon': [(0.371, 0.3323), (0.6278, 0.3323)],
    'strawberry': [(0.3697, 0.5018), (0.6272, 0.502)],
    'carrot': [(0.3989, 0.4604), (0.5998, 0.4604)],
    'corn': [(0.3909, 0.4261), (0.6061, 0.4261)],
    'tomato': [(0.3595, 0.5548), (0.6227, 0.5548)],
    'grape': [(0.3686, 0.5059), (0.5518, 0.5071)],
    'acorn': [(0.4541, 0.5902), (0.6735, 0.5392)],
    'bear': [(0.3821, 0.3152), (0.615, 0.3154)],
    'cat': [(0.2802, 0.3711), (0.5035, 0.371)],
    'cow': [(0.2391, 0.4056), (0.3872, 0.4097)],
    'squirrel': [(0.2047, 0.3472), (0.3847, 0.3568)],
    'moon': [(0.2449, 0.5612), (0.3992, 0.6414)],
    'balloon': [(0.4088, 0.3431), (0.5899, 0.3531)],
    'blanket': [(0.3335, 0.4801), (0.4928, 0.4806)],
    'stroller': [(0.2988, 0.5054), (0.4631, 0.5007)],
    'airplane': [(0.2246, 0.4505), (0.3307, 0.4633)],
}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}

    # ── 토끼: 두 귀(뿌리에서 가로로 자름), 꼬리 방울
    img = load('rabbit')
    X, Y = grid(img.shape)
    a = img[..., 3] > 0
    cut = 0.305
    ear_l = a & (Y < cut) & (X > 0.27) & (X < 0.455)
    ear_r = a & (Y < cut) & (X > 0.50) & (X < 0.68)
    pom = a & (((X - 0.735) ** 2 + (Y - 0.81) ** 2) < 0.06 ** 2) & (X > 0.716)
    meta['rabbit'] = make('rabbit', [('ear-l', ear_l, 0), ('ear-r', ear_r, 0), ('tail', pom, 0)], [(0.383, 0.462), (0.563, 0.462)])

    # ── 강아지: 진한 갈색 두 귀 + 꼬리 (색으로 구분), 귀가 덮던 얼굴 틈은 주변 색으로
    img = load('puppy')
    X, Y = grid(img.shape)
    R, G, B, A = [img[..., i].astype(int) for i in range(4)]
    brown = (A > 60) & (R < 190) & (G < 105) & (R > 55) & (R - B > 50)
    lab, n = ndimage.label(brown)

    def comp(px, py):
        m = lab == lab[int(py * img.shape[0]), int(px * img.shape[1])]
        m = ndimage.binary_fill_holes(m)
        # 귀·꼬리 둘레의 옅은 테두리(번짐)까지 함께 떼어 냄
        return ndimage.binary_dilation(m, iterations=6) & (A > 0)

    ear_l = comp(0.15, 0.30)
    ear_r = comp(0.78, 0.28)
    tail = comp(0.88, 0.55)
    meta['puppy'] = make('puppy', [('ear-l', ear_l, 26), ('ear-r', ear_r, 26), ('tail', tail, 18)], [(0.372, 0.336), (0.583, 0.334)])

    # ── 돌고래: 꼬리 쪽 몸(세로로 자름, 자른 자리는 움직이지 않음)
    img = load('dolphin')
    X, Y = grid(img.shape)
    a = img[..., 3] > 0
    tail = a & (X < 0.30)
    meta['dolphin'] = make('dolphin', [('tail', tail, 0)], [(0.785, 0.465)])

    # ── 눈 깜빡임만 (부위 움직임 없음): 눈 위치는 입 위치를 기준으로 찾은 뒤 눈으로 확인한 값
    for key, centers in EYES_ONLY.items():
        meta[key] = make(key, [], centers)

    with open(os.path.join(OUT, 'rig.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main()
