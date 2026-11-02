import type { Prepared, PreparedRig } from './images';
import { paperGrain } from './images';
import type { MotionFrame } from './motion';
import { computePose } from './poses';
import type { AnimSettings, CaptionSettings, ImgTransform } from './types';

export interface SceneInfo {
  prepared: Prepared | null;
  transform: ImgTransform;
  anim: AnimSettings;
  title?: string;
  date?: string;
  caption?: CaptionSettings;
  /** 자막이 나타난 정도 0~1 */
  captionReveal?: number;
  months?: string;
  /** 0~1 (여러 단어를 이을 때 장면 전환) */
  alpha?: number;
}

export const COLORS = {
  paper: '#FBF6EC',
  ink: '#3A3350',
  soft: '#8A8199',
  shadow: 'rgba(110, 80, 50, 0.11)',
  wind: '#9CCBE6',
  cloud: '#E4F1F8',
  water: '#86C3E6',
  star: '#F6C343',
  heart: '#F49AB0',
  ring: '#F2803A',
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

const FONTS = {
  title: (px: number) => `${px}px Jua, "Gowun Dodum", sans-serif`,
  small: (px: number) => `${px}px "Gowun Dodum", sans-serif`,
  hand: (px: number) => `700 ${px}px Gaegu, "Gowun Dodum", sans-serif`,
  gothic: (px: number) => `800 ${px}px "Nanum Gothic", "Gowun Dodum", sans-serif`,
};

export function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.35;
  const pat = ctx.createPattern(paperGrain(), 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** 그림 상자 위치/크기 */
export function layoutBox(W: number, H: number) {
  const S = Math.min(W * 0.78, H * 0.43);
  return { S, cx: W / 2, cy: H * 0.42 };
}

export function renderScene(ctx: CanvasRenderingContext2D, W: number, H: number, scene: SceneInfo, m: MotionFrame) {
  drawBackground(ctx, W, H);
  ctx.save();
  ctx.globalAlpha = scene.alpha ?? 1;
  drawTop(ctx, W, H, scene);
  const { S, cx, cy } = layoutBox(W, H);
  if (scene.prepared) drawIllustration(ctx, S, cx, cy, scene.prepared, scene.transform, scene.anim, m);
  drawBottom(ctx, W, H, scene);
  ctx.restore();
}

function drawTop(ctx: CanvasRenderingContext2D, W: number, H: number, s: SceneInfo) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = H * 0.085;
  if (s.date) {
    ctx.fillStyle = COLORS.soft;
    ctx.font = FONTS.small(Math.round(W * 0.036));
    ctx.fillText(s.date, W / 2, y);
    y += W * 0.075;
  }
  if (s.title) {
    ctx.fillStyle = COLORS.ink;
    ctx.font = FONTS.title(Math.round(W * 0.062));
    fitText(ctx, s.title, W / 2, y, W * 0.86);
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
  const w = ctx.measureText(text).width;
  if (w > maxW) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(maxW / w, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  } else ctx.fillText(text, x, y);
}

function drawBottom(ctx: CanvasRenderingContext2D, W: number, H: number, s: SceneInfo) {
  const c = s.caption;
  const capY = H * (0.765 + (c ? c.position : 0.5) * 0.08);
  let monthsY = capY;
  if (c && c.show && c.text.trim()) {
    const reveal = c.mode === 'always' ? 1 : ease(s.captionReveal ?? 0);
    if (reveal > 0.001) {
      const base = c.font === 'hand' ? W * 0.135 : W * 0.105;
      const px = Math.round(base * c.size);
      ctx.save();
      ctx.globalAlpha *= reveal;
      ctx.translate(W / 2, capY + (1 - reveal) * H * 0.025);
      const sc = 0.88 + 0.12 * reveal;
      ctx.scale(sc, sc);
      ctx.font = c.font === 'hand' ? FONTS.hand(px) : FONTS.gothic(px);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const tw = Math.min(ctx.measureText(c.text).width, W * 0.86);
      // 크레파스 형광펜 같은 밑줄
      ctx.fillStyle = 'rgba(246, 205, 76, 0.42)';
      roundRect(ctx, -tw / 2 - px * 0.18, -px * 0.32, tw + px * 0.36, px * 0.36, px * 0.18);
      ctx.fill();
      ctx.fillStyle = c.color;
      fitText(ctx, c.text, 0, 0, W * 0.86);
      ctx.restore();
    }
    monthsY = capY + base2(W, c) * 0.62 + W * 0.03;
  }
  if (s.months) {
    ctx.fillStyle = COLORS.soft;
    ctx.font = FONTS.small(Math.round(W * 0.042));
    ctx.textAlign = 'center';
    ctx.fillText(s.months, W / 2, Math.min(monthsY, H * 0.95));
  }
}
function base2(W: number, c: CaptionSettings) {
  return (c.font === 'hand' ? W * 0.135 : W * 0.105) * c.size;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}


/**
 * 그림 한 장 그리기. 원본 그림을 변형(늘이기·기울이기·이동)만 하며
 * 눈·입 같은 얼굴 요소는 어떤 경우에도 추가하지 않습니다.
 */
export function drawIllustration(
  ctx: CanvasRenderingContext2D,
  S: number,
  cx: number,
  cy: number,
  prep: Prepared,
  tf: ImgTransform,
  a: AnimSettings,
  m: MotionFrame
) {
  const ar = prep.w / prep.h;
  const fit = ar >= 1 ? [S, S / ar] : [S * ar, S];
  const dw = fit[0] * tf.scale;
  const dh = fit[1] * tf.scale;
  const bx = cx + tf.x * S;
  const by = cy + tf.y * S;

  const k = a.intensity;
  const sp = a.speed;
  const t = m.t;
  const spr = clamp(m.spring, -0.3, 1.3);
  const lvl = clamp(m.lvl, 0, 1);
  const pulse = clamp(m.pulse, 0, 1);
  const speak = clamp(m.speak, 0, 1);

  // 자동 테스트용: 마지막 움직임 값 (화면에는 영향 없음)
  (globalThis as any).__mallangMotion = m;

  // 캐릭터별 몸 움직임 (poses.ts). facing: 그림이 보는 방향(오른쪽 1, 왼쪽 -1)
  const facing = prep.facing ?? 1;
  const pose = computePose(a, m, S, facing);
  // 실제 그림 영역(투명 여백 제외): 그림 가운데 기준 위치·크기
  const bd = prep.bounds ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const artCx = ((bd.x0 + bd.x1) / 2 - 0.5) * dw;
  const artCy = ((bd.y0 + bd.y1) / 2 - 0.5) * dh;
  const artW = (bd.x1 - bd.x0) * dw;
  const artH = (bd.y1 - bd.y0) * dh;
  const ground = by + (bd.y1 - 0.5) * dh; // 실제 그림의 바닥

  // ── 뒤쪽 효과
  if (a.effects && a.type === 'fly') mirrored(ctx, cx, facing, () => drawClouds(ctx, S, cx, cy, m, k));

  // ── 바닥 그림자: 떠오를수록 작고 옅게, 착지하면 넓고 진하게
  if (pose.shadow > 0) {
    const lift = clamp(pose.lift, 0, 1);
    const sc = 1 - 0.45 * lift;
    ctx.save();
    ctx.globalAlpha *= pose.shadow * (1 - 0.5 * lift);
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    const sw = artW * 0.4 * sc * (pose.sx || 1);
    ctx.ellipse(bx + artCx + pose.dx * 0.8, ground + S * 0.02, sw, S * 0.028 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── 그림
  // 화면에서 실제로 그려질 크기(캔버스 배율 포함) → 그 크기에 맞는 축소본 사용
  const tr = ctx.getTransform();
  const need = dw * Math.hypot(tr.a, tr.b) * 1.15;
  ctx.save();
  {
    // 회전·크기 변화의 중심: 아래(착지), 위(매달림), 뒤쪽 아래(끄덕) 등 캐릭터마다 다름.
    // 이미지 테두리가 아니라 투명 여백을 뺀 실제 그림 기준 (예: 수박 바닥 = 수박이 실제로 닿는 곳)
    const pvx = artCx + pose.pivot.x * artW, pvy = artCy + pose.pivot.y * artH;
    ctx.translate(bx + pose.dx + pvx, by + pose.dy + pvy);
    ctx.rotate(pose.rot);
    ctx.scale(pose.sx, pose.sy);
    ctx.translate(-pvx, -pvy);
  }
  const rig = prep.rig;
  if (rig) {
    if (rig.base) {
      // 부위별 움직임: 바탕 → 부위(뿌리를 축으로 휨) → 눈. 몸 전체 물결(warp) 대신 부위가 움직임
      pose.warp = undefined;
      // 몸 뒤 부위(꼬리 등) → 바탕 → 몸 앞 부위(귀 등)
      for (const part of rig.parts) if (part.def.behind) drawRigPart(ctx, part, prep.w, prep.h, dw, dh, partAngle(part.def, a, m), need);
      ctx.drawImage(mip(rig.base, need).img, -dw / 2, -dh / 2, dw, dh);
      for (const part of rig.parts) if (!part.def.behind) drawRigPart(ctx, part, prep.w, prep.h, dw, dh, partAngle(part.def, a, m), need);
    } else if (pose.warp) drawWarped(ctx, mip(prep.img, need).img, -dw / 2, -dh / 2, dw, dh, pose.warp);
    else ctx.drawImage(mip(prep.img, need).img, -dw / 2, -dh / 2, dw, dh);
    // 눈 깜빡임 (몸이 물결치면 눈도 같이 따라감)
    drawEyes(ctx, rig, dw, dh, t, lvl, pose.warp, need);
  } else if (pose.warp) drawWarped(ctx, mip(prep.img, need).img, -dw / 2, -dh / 2, dw, dh, pose.warp);
  else ctx.drawImage(mip(prep.img, need).img, -dw / 2, -dh / 2, dw, dh);
  // 회전 부품 (기본 유모차 바퀴)
  for (const p of prep.parts) {
    const px = -dw / 2 + p.cx * dw;
    const py = -dh / 2 + p.cy * dh;
    const pr = p.r * dw;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(m.travel * 2.2);
    ctx.drawImage(p.img, -pr, -pr, pr * 2, pr * 2);
    ctx.restore();
  }
  // 기본 그림의 입: 그림체와 같은 색·굵기로, 목소리 크기만큼 열림 (끄면 미소로 고정)
  if (prep.mouth) drawMouth(ctx, prep.mouth, dw, dh, a.mouth !== false, lvl, pulse, pose.warp);
  ctx.restore();

  // ── 앞쪽 효과 (효과: 먼지·물결·물방울·하트·바람선 / 반짝임: 별)
  const left = bx + pose.dx - dw / 2;
  const top = by + pose.dy + artCy - artH / 2;
  if (a.effects) {
    if (a.type === 'fly') mirrored(ctx, bx + pose.dx, facing, () => drawWind(ctx, S, left, by + pose.dy, m, k));
    if (a.type === 'roll') mirrored(ctx, bx + pose.dx, facing, () => drawRollLines(ctx, S, left, ground, m, k));
    if (a.type === 'float') drawRings(ctx, S, bx + pose.dx, by + pose.dy, Math.max(dw, dh), m);
    if (a.type === 'swim' || a.type === 'leap') {
      drawWater(ctx, S, bx, by + dh * 0.42, dw, m);
      drawBubbles(ctx, S, bx + pose.dx + f1x(facing) * dw * 0.35, top + dh * 0.2, m);
    }
    if (pose.fx.splash !== undefined) drawSplash(ctx, S, bx + pose.dx + facing * dw * 0.12, by + dh * 0.42 + S * 0.08, pose.fx.splash);
    if (POP_TYPES.has(a.type)) drawPops(ctx, S, bx + pose.dx + artCx, top, artW, m);
    if (a.type === 'cozy') drawPuffs(ctx, S, bx + artCx, top, artW, m);
    if (pose.fx.thud !== undefined) drawThud(ctx, S, bx + artCx, ground, artW, pose.fx.thud);
    if (pose.fx.heart !== undefined) drawHeartPop(ctx, S, bx + pose.dx + artCx + artW * 0.32, top + artH * 0.06, pose.fx.heart, a.type === 'cozy' ? 0.6 : 1);
  }
  if (a.sparkles) drawStars(ctx, S, bx + pose.dx, by + pose.dy, Math.max(dw, dh), m, pose.sparkle);
}

type Warp = { axis: 'rows' | 'cols'; amp: number; freq: number; phase: number };

type Img = CanvasImageSource & { width: number; height: number };
type Mip = { img: Img; qx: number; qy: number };
const mipCache = new WeakMap<object, HTMLCanvasElement[]>();
/**
 * 작게 그릴 때 쓰는 미리 줄여 둔 그림 (원본 768px를 매 프레임 작게 줄이면 휴대폰에서 무거움).
 * need: 화면에 그려질 가로 픽셀. 반씩 줄인 사본 중 need보다 큰 가장 작은 것을 돌려줌. q = 사본/원본 비율
 */
function mip(img: Img, need: number): Mip {
  let lv = mipCache.get(img);
  if (!lv) mipCache.set(img, (lv = []));
  let src: Img = img;
  for (let i = 0; src.width / 2 >= need * 1.05 && src.width / 2 >= 24; i++) {
    if (!lv[i]) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(src.width / 2));
      c.height = Math.max(1, Math.round(src.height / 2));
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, c.width, c.height);
      lv[i] = c;
    }
    src = lv[i];
  }
  return { img: src, qx: src.width / img.width, qy: src.height / img.height };
}

/** 몸이 물결칠 때 그림의 한 점(0~1 좌표)이 얼마나 밀리는지 (drawWarped와 같은 식) */
function warpOffset(x: number, y: number, warp?: Warp): [number, number] {
  if (!warp) return [0, 0];
  if (warp.axis === 'cols') return [0, Math.sin(x * warp.freq * Math.PI * 2 - warp.phase) * warp.amp * (0.3 + 0.7 * (1 - x))];
  return [Math.sin(y * warp.freq * Math.PI * 2 + warp.phase) * warp.amp * (0.35 + 0.65 * Math.abs(y - 0.5) * 2), 0];
}

// ───────── 부위별 움직임 (2D 뼈대) ─────────

/** 부위가 얼마나 기울지 (라디안). 어떤 움직임 방식을 골라도 목소리 신호로 자연스럽게 반응 */
function partAngle(def: PreparedRig['parts'][number]['def'], a: AnimSettings, m: MotionFrame): number {
  const k = a.intensity;
  const sp = a.speed;
  const t = m.t;
  const spr = clamp(m.spring, -0.3, 1.3);
  const lvl = clamp(m.lvl, 0, 1);
  const pulse = clamp(m.pulse, 0, 1);
  const speak = clamp(m.speak, 0, 1);
  const side = def.side ?? 1;
  const ph = side > 0 ? 1.3 : 0; // 양쪽이 똑같이 움직이지 않게
  return (def.amp ?? 1) * driveAngle(def.drive, side, ph, k, sp, t, spr, lvl, pulse, speak, m);
}

function driveAngle(
  drive: PreparedRig['parts'][number]['def']['drive'],
  side: number, ph: number, k: number, sp: number, t: number,
  spr: number, lvl: number, pulse: number, speak: number, m: MotionFrame
): number {
  switch (drive) {
    case 'earTwitch': {
      // 뾰족한 귀: 소리가 툭 커지면 움찔, 말하는 동안 살짝 바깥으로, 조용할 땐 가끔 혼자 쫑긋
      const n = Math.floor((t + ph) / 3.1);
      const at = n * 3.1 + 0.5 + hash01(n * 3.7 + ph) * 2;
      const u = (t + ph - at) / 0.32;
      const solo = u >= 0 && u <= 1 ? Math.sin(Math.PI * u) * Math.sin(u * Math.PI * 4) : 0;
      return side * (0.24 * k * pulse * Math.sin(t * 28 * sp) + 0.07 * k * clamp(spr, 0, 1.2) + 0.16 * solo * (1 - speak)) + 0.015 * Math.sin(t * 1.4 * sp + ph);
    }
    case 'tailSway': {
      // 고양이 꼬리: 느긋하게 S자로 살랑, 말하면 조금 더 크게, 큰 소리에 휙
      return Math.sin(t * 1.5 * sp + 0.5) * (0.14 + 0.14 * k * speak) + 0.1 * k * clamp(spr, 0, 1.2) + 0.16 * k * pulse * Math.sin(t * 16 * sp);
    }
    case 'tailSwish': {
      // 소 꼬리: 평소엔 천천히, 말할수록 빠르게 좌우로 휙휙
      return Math.sin(t * (1.6 + 4.5 * speak) * sp) * (0.16 + 0.3 * k * speak + 0.1 * k * lvl);
    }
    case 'bushyTail': {
      // 다람쥐 큰 꼬리: 목소리에 들썩, 출렁출렁 (꼬리가 커서 각도는 작게)
      return 0.1 * k * clamp(spr, 0, 1.2) + Math.sin(t * (1.8 + 2.5 * speak) * sp) * (0.05 + 0.09 * k * speak) + 0.12 * k * pulse * Math.sin(t * 13 * sp);
    }
    case 'earUp': {
      // 쫑긋 귀: 목소리만큼 바깥으로 벌어지고, 소리가 툭 커지면 출렁 + 평소엔 살랑
      const spread = 0.17 * k * clamp(spr, -0.1, 1.2);
      const jiggle = 0.14 * k * pulse * Math.sin(t * 23 * sp + ph);
      const idle = 0.035 * Math.sin(t * 1.7 * sp + ph) + 0.05 * speak * Math.sin(m.phase * 0.9 + ph);
      return side * (spread + jiggle) + idle;
    }
    case 'earFlop': {
      // 늘어진 귀: 목소리에 바깥으로 펄럭 들렸다 내려옴
      const lift = 0.16 * k * clamp(spr, -0.1, 1.2) + 0.1 * k * lvl * (0.5 + 0.5 * Math.sin(t * 14 * sp + ph));
      const jiggle = 0.1 * k * pulse * Math.sin(t * 20 * sp + ph);
      const idle = 0.025 * Math.sin(t * 1.3 * sp + ph);
      return -side * (lift + jiggle) + idle;
    }
    case 'tailWag': {
      // 꼬리: 평소엔 천천히, 말할수록 빠르고 크게 살랑살랑
      const speed = (2.2 + 11 * speak + 5 * lvl) * sp;
      const amp = 0.12 + 0.32 * k * speak + 0.18 * k * lvl;
      return Math.sin(t * speed) * amp;
    }
    case 'pom': {
      // 방울 꼬리: 소리마다 달랑
      return 0.28 * k * pulse * Math.sin(t * 22 * sp) + 0.06 * k * spr + 0.03 * Math.sin(t * 2 * sp);
    }
    case 'fluke': {
      // 꼬리지느러미: 말하는 동안 물을 차듯 크게, 평소엔 천천히 살랑
      const amp = 0.1 + 0.3 * k * speak + 0.14 * k * lvl;
      return Math.sin(m.phase * 1.6 + t * 1.8 * sp) * amp;
    }
  }
  return 0;
}

/** 부위 조각을 뿌리(pivot) 기준으로 휘게 그리기: 작은 삼각형으로 나눠 각각 옮겨 그림 */
function drawRigPart(
  ctx: CanvasRenderingContext2D,
  part: PreparedRig['parts'][number],
  iw: number,
  ih: number,
  dw: number,
  dh: number,
  angle: number,
  need: number
) {
  const d = part.def;
  const mp = mip(part.img, need);
  const [x0, y0, x1, y1] = d.box;
  let px = d.pivot[0] * iw, py = d.pivot[1] * ih;
  let ax = (d.tip[0] - d.pivot[0]) * iw, ay = (d.tip[1] - d.pivot[1]) * ih;
  let L = Math.hypot(ax, ay) || 1;
  let ux = ax / L, uy = ay / L;
  if (d.cut) {
    // 자른 선의 가운데가 뿌리, 축은 자른 선에 수직(끝 쪽으로) → 자른 선 위의 점은 전혀 움직이지 않음
    const [[cx1, cy1], [cx2, cy2]] = d.cut;
    px = ((cx1 + cx2) / 2) * iw;
    py = ((cy1 + cy2) / 2) * ih;
    let nx = -(cy2 - cy1) * ih, ny = (cx2 - cx1) * iw;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const tx = d.tip[0] * iw - px, ty = d.tip[1] * ih - py;
    if (nx * tx + ny * ty < 0) (nx = -nx), (ny = -ny);
    ux = nx;
    uy = ny;
    L = Math.max(1, nx * tx + ny * ty);
  }
  const kx = dw / iw, ky = dh / ih;
  // 통째로 도는 부위이거나 거의 안 움직이면 조각 없이 한 번에 그림 (가볍게)
  if (d.bend === 0 || Math.abs(angle) < 0.004) {
    ctx.save();
    const ppx = -dw / 2 + px * kx, ppy = -dh / 2 + py * ky;
    ctx.translate(ppx, ppy);
    ctx.rotate(d.bend === 0 ? angle : 0);
    ctx.translate(-ppx, -ppy);
    const bx = x0 * iw, by = y0 * ih, bw = (x1 - x0) * iw, bh = (y1 - y0) * ih;
    ctx.drawImage(mp.img, bx * mp.qx, by * mp.qy, bw * mp.qx, bh * mp.qy, -dw / 2 + bx * kx, -dh / 2 + by * ky, bw * kx, bh * ky);
    ctx.restore();
    return;
  }
  // 휘는 방향으로는 촘촘히, 가로질러서는 성기게 나눔.
  // 화면에 작게 보일수록 조각 수를 줄임(조각마다 잘라 그리기라 휴대폰에서 무거움) — 크게 보일 땐 예전처럼 촘촘히
  const seg = (c: number, px: number) => {
    const ac = Math.abs(c);
    const [len, max] = ac > 0.7 ? [16, 8] : ac > 0.35 ? [26, 5] : [56, 3];
    return Math.max(1, Math.min(max, Math.ceil(px / len)));
  };
  const NX = seg(ux, (x1 - x0) * dw);
  const NY = seg(uy, (y1 - y0) * dh);
  const sx: number[] = [], sy: number[] = [], tx: number[] = [], ty: number[] = [];
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = (x0 + ((x1 - x0) * i) / NX) * iw;
      const y = (y0 + ((y1 - y0) * j) / NY) * ih;
      // 뿌리에서 끝 방향으로 얼마나 떨어졌는지 (0~1) → 끝으로 갈수록 더 많이 회전 = 휨
      const s = ((x - px) * ux + (y - py) * uy) / L;
      const w = d.bend === 0 ? 1 : s <= 0 ? 0 : Math.pow(Math.min(1, s), d.bend);
      const th = angle * w;
      const c = Math.cos(th), sn = Math.sin(th);
      const rx = px + (x - px) * c - (y - py) * sn;
      const ry = py + (x - px) * sn + (y - py) * c;
      sx.push(x); sy.push(y);
      tx.push(-dw / 2 + rx * kx); ty.push(-dh / 2 + ry * ky);
    }
  }
  const at = (i: number, j: number) => j * (NX + 1) + i;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), e = at(i + 1, j + 1);
      drawTri(ctx, mp, sx[a], sy[a], sx[b], sy[b], sx[c], sy[c], tx[a], ty[a], tx[b], ty[b], tx[c], ty[c]);
      drawTri(ctx, mp, sx[b], sy[b], sx[e], sy[e], sx[c], sy[c], tx[b], ty[b], tx[e], ty[e], tx[c], ty[c]);
    }
  }
}

/** 원본 삼각형(s)을 화면 삼각형(d)으로 옮겨 그리기. 이음새가 보이지 않게 조금 크게 자름 */
function drawTri(
  ctx: CanvasRenderingContext2D,
  mp: Mip,
  sx0: number, sy0: number, sx1: number, sy1: number, sx2: number, sy2: number,
  dx0: number, dy0: number, dx1: number, dy1: number, dx2: number, dy2: number
) {
  const ex1 = sx1 - sx0, ey1 = sy1 - sy0, ex2 = sx2 - sx0, ey2 = sy2 - sy0;
  const det = ex1 * ey2 - ex2 * ey1;
  if (Math.abs(det) < 1e-6) return;
  const du1 = dx1 - dx0, dv1 = dy1 - dy0, du2 = dx2 - dx0, dv2 = dy2 - dy0;
  const A = (du1 * ey2 - du2 * ey1) / det;
  const C = (du2 * ex1 - du1 * ex2) / det;
  const B = (dv1 * ey2 - dv2 * ey1) / det;
  const D = (dv2 * ex1 - dv1 * ex2) / det;
  const E = dx0 - A * sx0 - C * sy0;
  const F = dy0 - B * sx0 - D * sy0;
  // 무게중심에서 바깥으로 살짝 키운 삼각형으로 자르기
  const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
  const grow = (x: number, y: number): [number, number] => {
    const vx = x - cx, vy = y - cy;
    const l = Math.hypot(vx, vy) || 1;
    return [x + (vx / l) * 0.9, y + (vy / l) * 0.9];
  };
  const [g0x, g0y] = grow(dx0, dy0), [g1x, g1y] = grow(dx1, dy1), [g2x, g2y] = grow(dx2, dy2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g0x, g0y);
  ctx.lineTo(g1x, g1y);
  ctx.lineTo(g2x, g2y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(A, B, C, D, E, F);
  const bx0 = Math.max(0, Math.floor(Math.min(sx0, sx1, sx2)) - 2);
  const by0 = Math.max(0, Math.floor(Math.min(sy0, sy1, sy2)) - 2);
  // 원본 좌표 그대로 쓰되, 실제로는 축소본에서 같은 자리를 가져옴
  const { img, qx, qy } = mp;
  const bx1 = Math.min(img.width / qx, Math.ceil(Math.max(sx0, sx1, sx2)) + 2);
  const by1 = Math.min(img.height / qy, Math.ceil(Math.max(sy0, sy1, sy2)) + 2);
  if (bx1 > bx0 && by1 > by0) ctx.drawImage(img, bx0 * qx, by0 * qy, (bx1 - bx0) * qx, (by1 - by0) * qy, bx0, by0, bx1 - bx0, by1 - by0);
  ctx.restore();
}

/** 0~1 고정 난수 (같은 시각이면 화면·영상이 똑같이 깜빡이도록) */
const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 눈 감긴 정도 0(뜸)~1(감음): 3~4초마다 자연스럽게 깜빡, 가끔 두 번. 크게 말하면 살짝 웃는 눈 */
export function blinkAmount(t: number, seed: number, lvl: number): number {
  const P = 3.6;
  const tt = t + seed * 3.1;
  const n = Math.floor(tt / P);
  const start = 0.4 + hash01(n + seed) * 2.4;
  const dur = 0.17;
  let c = 0;
  const local = tt - n * P;
  for (const off of hash01(n * 1.7 + seed) > 0.72 ? [0, 0.3] : [0]) {
    const u = (local - start - off) / dur;
    if (u >= 0 && u <= 1) c = Math.max(c, Math.sin(Math.PI * u));
  }
  const squint = 0.3 * clamp((lvl - 0.5) / 0.4, 0, 1);
  return Math.max(c, squint);
}

/** 눈 그리기: 감는 만큼 세로로 납작해지고, 거의 감기면 그림체와 같은 색의 곡선(감은 눈) */
function drawEyes(ctx: CanvasRenderingContext2D, rig: PreparedRig, dw: number, dh: number, t: number, lvl: number, warp: Warp | undefined, need: number) {
  const c = blinkAmount(t, rig.seed, lvl);
  const eye = mip(rig.eyeImg, need).img;
  const cover = rig.cover ? mip(rig.cover, need).img : null;
  const iw = eye.width, ih = eye.height;
  for (const e of rig.eyes) {
    const [ox, oy] = warpOffset(e.cx, e.cy, warp);
    // 원본 그림 위에 그릴 때: 먼저 원래 눈 자리를 얼굴색 덮개로 가림
    if (cover) {
      const mc = 2.6;
      const cw = cover.width, chh = cover.height;
      const csx = (e.cx - e.rx * mc) * cw, csy = (e.cy - e.ry * mc) * chh;
      const csw = e.rx * 2 * mc * cw, csh = e.ry * 2 * mc * chh;
      ctx.drawImage(cover, csx, csy, csw, csh, -dw / 2 + (e.cx - e.rx * mc) * dw + ox, -dh / 2 + (e.cy - e.ry * mc) * dh + oy, e.rx * 2 * mc * dw, e.ry * 2 * mc * dh);
    }
    const m = 1.9; // 눈 둘레 번짐까지
    const sx = (e.cx - e.rx * m) * iw, sy = (e.cy - e.ry * m) * ih;
    const sw = e.rx * 2 * m * iw, sh = e.ry * 2 * m * ih;
    const dx = -dw / 2 + (e.cx - e.rx * m) * dw + ox;
    const dcy = -dh / 2 + e.cy * dh + oy;
    const open = 1 - c;
    if (open > 0.08) {
      const h = e.ry * 2 * m * dh * open;
      ctx.drawImage(eye, sx, sy, sw, sh, dx, dcy - h / 2, e.rx * 2 * m * dw, h);
    }
    if (c > 0.55) {
      ctx.save();
      ctx.globalAlpha *= clamp((c - 0.55) / 0.3, 0, 1);
      ctx.strokeStyle = e.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.2, e.ry * dh * 0.42);
      const r = e.rx * dw * 1.15;
      ctx.beginPath();
      ctx.arc(-dw / 2 + e.cx * dw + ox, dcy - r * 0.45, r, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  mt: { x: number; y: number; w: number; color: string },
  dw: number,
  dh: number,
  talking: boolean,
  lvl: number,
  pulse: number,
  warp?: { axis: 'rows' | 'cols'; amp: number; freq: number; phase: number }
) {
  let mx = -dw / 2 + mt.x * dw;
  let my = -dh / 2 + mt.y * dh;
  if (warp) {
    if (warp.axis === 'cols') my += Math.sin(mt.x * warp.freq * Math.PI * 2 - warp.phase) * warp.amp * (0.3 + 0.7 * (1 - mt.x));
    else mx += Math.sin(mt.y * warp.freq * Math.PI * 2 + warp.phase) * warp.amp * (0.35 + 0.65 * Math.abs(mt.y - 0.5) * 2);
  }
  const w = mt.w * dw;
  const open = talking ? clamp((lvl - 0.05) * 1.25 + pulse * 0.12, 0, 1) : 0;
  ctx.save();
  ctx.fillStyle = mt.color;
  ctx.strokeStyle = mt.color;
  ctx.lineCap = 'round';
  if (open < 0.12) {
    // 다문 입: 작은 미소
    ctx.lineWidth = Math.max(1.5, w * 0.15);
    ctx.beginPath();
    ctx.arc(mx, my - w * 0.32, w * 0.46, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
  } else {
    const h = w * (0.18 + 0.78 * open);
    const hw = (w * (0.96 - 0.14 * open)) / 2;
    const top = my - w * 0.14;
    ctx.beginPath();
    ctx.moveTo(mx - hw, top);
    ctx.quadraticCurveTo(mx, top + w * 0.08, mx + hw, top);
    ctx.bezierCurveTo(mx + hw * 0.95, top + h * 1.1, mx - hw * 0.95, top + h * 1.1, mx - hw, top);
    ctx.closePath();
    ctx.fill();
    if (open > 0.35) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#EF8D9B';
      ctx.beginPath();
      ctx.ellipse(mx, top + h * 0.85, hw * 0.62, h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawWarped(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
  wp: { axis: 'rows' | 'cols'; amp: number; freq: number; phase: number }
) {
  // 띠 수: 화면에 보이는 크기에 맞춰 (작게 보이면 적게 → 가볍게)
  const N = Math.max(8, Math.min(28, Math.round((wp.axis === 'rows' ? h : w) / 9)));
  const iw = img.width, ih = img.height;
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const u1 = (i + 1) / N;
    const um = (u0 + u1) / 2;
    if (wp.axis === 'rows') {
      const edge = 0.35 + 0.65 * Math.abs(um - 0.5) * 2;
      const off = Math.sin(um * wp.freq * Math.PI * 2 + wp.phase) * wp.amp * edge;
      ctx.drawImage(img, 0, u0 * ih, iw, (u1 - u0) * ih + 1, x + off, y + u0 * h, w, (u1 - u0) * h + 1);
    } else {
      const tail = 0.3 + 0.7 * (1 - um);
      const off = Math.sin(um * wp.freq * Math.PI * 2 - wp.phase) * wp.amp * tail;
      ctx.drawImage(img, u0 * iw, 0, (u1 - u0) * iw + 1, ih, x + u0 * w, y + off, (u1 - u0) * w + 1, h);
    }
  }
}

// ───────── 효과 ─────────

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.32;
    ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStars(ctx: CanvasRenderingContext2D, S: number, cx: number, cy: number, D: number, m: MotionFrame, amount = 1) {
  const sp = clamp(m.speak, 0, 1) * amount;
  if (sp < 0.02) return;
  ctx.save();
  ctx.fillStyle = COLORS.star;
  const spots = [
    [-0.62, -0.42], [0.6, -0.5], [0.7, 0.05], [-0.7, 0.12], [0.35, -0.68],
  ];
  spots.forEach(([ux, uy], i) => {
    const tw = 0.5 + 0.5 * Math.sin(m.t * 5 + i * 1.7);
    ctx.globalAlpha = sp * tw * 0.95;
    star(ctx, cx + ux * D * 0.62, cy + uy * D * 0.62, S * (0.018 + 0.02 * m.lvl) * (0.7 + tw * 0.5));
  });
  ctx.restore();
}

/** 그림이 왼쪽을 보면 효과(바람선·먼지·구름)도 좌우를 뒤집어 그림 */
function mirrored(ctx: CanvasRenderingContext2D, cx: number, facing: number, draw: () => void) {
  if (facing >= 0) return draw();
  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(-1, 1);
  ctx.translate(-cx, 0);
  draw();
  ctx.restore();
}
const f1x = (facing: number) => (facing >= 0 ? 1 : -1);

/** 말을 시작할 때 작은 하트 하나가 떠올랐다 사라짐 (쌓이지 않음). s: 시작 뒤 지난 초 */
function drawHeartPop(ctx: CanvasRenderingContext2D, S: number, x: number, y: number, s: number, size: number) {
  const u = clamp(s / 1.1, 0, 1);
  if (u <= 0 || u >= 1) return;
  const r = S * 0.03 * size * (0.6 + 0.4 * Math.sin(Math.min(1, u * 3) * Math.PI / 2));
  const yy = y - u * S * 0.16;
  ctx.save();
  ctx.globalAlpha *= Math.sin(Math.PI * u) * 0.9;
  ctx.fillStyle = COLORS.heart;
  ctx.beginPath();
  ctx.moveTo(x, yy + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, yy - r * 0.2, x - r * 0.7, yy - r * 1.4, x, yy - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.7, yy - r * 1.4, x + r * 1.6, yy - r * 0.2, x, yy + r * 0.9);
  ctx.fill();
  ctx.restore();
}

/** 물에 들어가는 자리에서 물방울이 튀어 오름. p: 0 → 1 */
function drawSplash(ctx: CanvasRenderingContext2D, S: number, x: number, y: number, p: number) {
  if (p <= 0 || p >= 1) return;
  ctx.save();
  ctx.fillStyle = COLORS.water;
  ctx.globalAlpha *= 1 - p;
  const drops = [[-0.9, 1.0], [-0.45, 1.35], [0, 1.5], [0.45, 1.3], [0.9, 0.95]];
  for (const [vx, vy] of drops) {
    const tx = x + vx * S * 0.09 * p;
    const ty = y - (vy * S * 0.16 * p - S * 0.2 * p * p);
    ctx.beginPath();
    ctx.arc(tx, ty, S * 0.012 * (1 - p * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = COLORS.water;
  ctx.lineWidth = S * 0.01;
  ctx.beginPath();
  ctx.ellipse(x, y, S * 0.06 * (0.4 + p), S * 0.012 * (0.4 + p), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawHearts(ctx: CanvasRenderingContext2D, S: number, cx: number, top: number, w: number, m: MotionFrame) {
  const sp = clamp(m.speak, 0, 1);
  if (sp < 0.02) return;
  ctx.save();
  ctx.fillStyle = COLORS.heart;
  for (let i = 0; i < 4; i++) {
    const cyc = (m.t * 0.45 + i * 0.27) % 1;
    const x = cx + (i - 1.5) * w * 0.28 + Math.sin(m.t * 2 + i) * S * 0.02;
    const y = top + S * 0.05 - cyc * S * 0.28;
    const r = S * 0.022;
    ctx.globalAlpha = sp * Math.sin(Math.PI * cyc) * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.5);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.fill();
  }
  ctx.restore();
}

function drawBubbles(ctx: CanvasRenderingContext2D, S: number, x0: number, y0: number, m: MotionFrame) {
  const sp = clamp(m.speak, 0, 1);
  if (sp < 0.02) return;
  ctx.save();
  ctx.strokeStyle = COLORS.water;
  ctx.lineWidth = S * 0.006;
  for (let i = 0; i < 4; i++) {
    const cyc = (m.t * 0.6 + i * 0.25) % 1;
    ctx.globalAlpha = sp * Math.sin(Math.PI * cyc);
    ctx.beginPath();
    ctx.arc(x0 + Math.sin(m.t * 3 + i * 2) * S * 0.02 + i * S * 0.02, y0 - cyc * S * 0.25, S * (0.012 + i * 0.004), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawClouds(ctx: CanvasRenderingContext2D, S: number, cx: number, cy: number, m: MotionFrame, k: number) {
  ctx.save();
  ctx.fillStyle = COLORS.cloud;
  const clouds = [
    [0.0, -0.32, 1.0], [0.55, 0.3, 0.75], [1.1, -0.05, 0.6],
  ];
  for (const [off, uy, sc] of clouds) {
    const pos = ((off + m.t * 0.04 + m.travel * 0.09 * k) % 1.65) / 1.65; // 0~1
    const x = cx + S * 0.85 - pos * S * 1.7;
    const y = cy + uy * S;
    const r = S * 0.07 * sc;
    ctx.globalAlpha = Math.sin(Math.PI * pos) * 0.95;
    ctx.beginPath();
    ctx.arc(x - r, y, r * 0.8, 0, Math.PI * 2);
    ctx.arc(x, y - r * 0.35, r, 0, Math.PI * 2);
    ctx.arc(x + r * 1.05, y, r * 0.75, 0, Math.PI * 2);
    ctx.rect(x - r, y, r * 2.05, r * 0.8);
    ctx.fill();
  }
  ctx.restore();
}

function drawWind(ctx: CanvasRenderingContext2D, S: number, left: number, cy: number, m: MotionFrame, k: number) {
  const lvl = clamp(m.lvl, 0, 1);
  if (lvl < 0.03) return;
  ctx.save();
  ctx.strokeStyle = COLORS.wind;
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.016;
  [-0.1, 0.02, 0.13].forEach((uy, i) => {
    const len = S * (0.06 + 0.28 * lvl) * clamp(k, 0.5, 1.6) * (i === 1 ? 1 : 0.7);
    const shift = ((m.t * 2.2 + i * 0.37) % 1) * S * 0.04;
    ctx.globalAlpha = 0.25 + 0.65 * lvl;
    ctx.beginPath();
    const x1 = left + S * 0.06 - shift;
    ctx.moveTo(x1, cy + uy * S);
    ctx.lineTo(x1 - len, cy + uy * S);
    ctx.stroke();
  });
  ctx.restore();
}

function drawRollLines(ctx: CanvasRenderingContext2D, S: number, left: number, bottom: number, m: MotionFrame, k: number) {
  const lvl = clamp(m.lvl, 0, 1);
  if (lvl < 0.03) return;
  ctx.save();
  ctx.strokeStyle = COLORS.soft;
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.012;
  [-0.36, -0.22].forEach((uy, i) => {
    ctx.globalAlpha = (0.2 + 0.5 * lvl) * (i ? 0.7 : 1);
    const len = S * (0.05 + 0.18 * lvl) * clamp(k, 0.5, 1.6);
    ctx.beginPath();
    ctx.moveTo(left, bottom + uy * S);
    ctx.lineTo(left - len, bottom + uy * S);
    ctx.stroke();
  });
  // 먼지 뭉게
  ctx.fillStyle = '#E8DCC6';
  for (let i = 0; i < 3; i++) {
    const cyc = (m.t * 1.4 + i * 0.33) % 1;
    ctx.globalAlpha = lvl * (1 - cyc) * 0.9;
    ctx.beginPath();
    ctx.arc(left - cyc * S * 0.12 + S * 0.04, bottom - S * 0.02 - cyc * S * 0.04, S * (0.015 + cyc * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRings(ctx: CanvasRenderingContext2D, S: number, cx: number, cy: number, D: number, m: MotionFrame) {
  const p = clamp(m.pulse, 0, 1);
  const lv = clamp(m.lvl, 0, 1);
  if (p < 0.02 && lv < 0.05) return;
  ctx.save();
  ctx.strokeStyle = COLORS.ring;
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.012;
  for (const side of [-1, 1]) {
    for (let j = 0; j < 2; j++) {
      const R = D * 0.52 + S * (0.04 + j * 0.06) + S * 0.06 * (1 - p);
      ctx.globalAlpha = Math.max(p * 0.7, lv * 0.35) * (j ? 0.6 : 1);
      ctx.beginPath();
      const a0 = side > 0 ? -0.35 : Math.PI - 0.35;
      ctx.arc(cx, cy, R, a0, a0 + 0.7);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWater(ctx: CanvasRenderingContext2D, S: number, cx: number, y0: number, w: number, m: MotionFrame) {
  ctx.save();
  ctx.strokeStyle = COLORS.water;
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.014;
  const lvl = clamp(m.lvl, 0, 1);
  [0, 1].forEach((j) => {
    const y = y0 + S * (0.08 + j * 0.06);
    const amp = S * (0.008 + 0.025 * lvl) * (j ? 0.7 : 1);
    const half = w * (0.55 - j * 0.12);
    ctx.globalAlpha = j ? 0.55 : 0.85;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const x = cx - half + u * half * 2;
      const yy = y + Math.sin(u * Math.PI * 4 + m.t * 3 + m.phase * 0.5 + j) * amp;
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  });
  ctx.restore();
}

/** 소리가 툭 커질 때 위로 작은 선이 튀는 움직임들 */
const POP_TYPES = new Set<string>(['hop', 'bounce', 'jelly', 'sprout', 'popcorn', 'tumble', 'bunny', 'wag', 'scurry', 'sway', 'wobbly']);

/** 묵직하게 착지할 때 바닥 양옆으로 먼지가 폴폴 (p: 1 → 0으로 사라짐) */
function drawThud(ctx: CanvasRenderingContext2D, S: number, cx: number, bottom: number, w: number, p: number) {
  if (p < 0.04) return;
  ctx.save();
  ctx.fillStyle = '#E3D6C2';
  ctx.globalAlpha = p * 0.8;
  const spread = (1 - p) * S * 0.06;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = cx + side * (w * 0.36 + spread + i * S * 0.025);
      const y = bottom + S * 0.015 - i * S * 0.012 * (1 - p);
      ctx.beginPath();
      ctx.arc(x, y, S * (0.016 - i * 0.004) * (0.6 + 0.4 * p), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPops(ctx: CanvasRenderingContext2D, S: number, cx: number, top: number, w: number, m: MotionFrame) {
  const p = clamp(m.pulse, 0, 1);
  if (p < 0.03) return;
  ctx.save();
  ctx.strokeStyle = COLORS.ring;
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.013;
  ctx.globalAlpha = p * 0.85;
  const r0 = S * 0.04, r1 = S * (0.07 + 0.03 * (1 - p));
  for (const ang of [-2.3, -1.57, -0.84]) {
    const x = cx + Math.cos(ang) * w * 0.1;
    const y = top - S * 0.02;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
    ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPuffs(ctx: CanvasRenderingContext2D, S: number, cx: number, top: number, w: number, m: MotionFrame) {
  const lvl = clamp(m.lvl, 0, 1);
  if (lvl < 0.04) return;
  ctx.save();
  ctx.strokeStyle = '#B9DDF2';
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.012;
  ctx.globalAlpha = 0.3 + 0.6 * lvl;
  for (let i = -1; i <= 1; i++) {
    const x = cx + i * w * 0.22;
    const y = top - S * 0.03;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + S * 0.02, y - S * 0.03, x, y - S * (0.05 + 0.04 * lvl));
    ctx.stroke();
  }
  ctx.restore();
}
