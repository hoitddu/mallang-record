import type { Prepared } from './images';
import { paperGrain } from './images';
import type { MotionFrame } from './motion';
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

interface Pose {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
  anchorBottom: boolean;
  warp?: { axis: 'rows' | 'cols'; amp: number; freq: number; phase: number };
  shadow: number; // 0이면 그림자 없음, 1 기본
  shadowScale: number;
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

  const pose: Pose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, anchorBottom: false, shadow: 1, shadowScale: 1 };

  switch (a.type) {
    case 'squish': {
      // 말랑: 목소리가 커지면 살짝 납작 → 탄성 있게 복원 (기본 강도에서 약 96~104%)
      const sq = 0.045 * k * spr;
      const wob = pulse * Math.sin(t * 22 * sp) * 0.018 * k;
      const idle = 0.005 * Math.sin(t * 2.2 * sp) * (1 - speak);
      pose.sx = 1 + sq * 0.9 + wob + idle;
      pose.sy = 1 - sq - wob - idle;
      pose.anchorBottom = true;
      pose.rot = Math.sin(m.phase * 0.5) * 0.02 * k * speak;
      break;
    }
    case 'hop': {
      // 콩콩: 소리가 툭 커질 때마다 작은 점프 + 소리 크기만큼 살짝 떠오름
      const arc = pulse > 0.01 ? Math.sin(Math.PI * (1 - pulse)) : 0;
      const h = S * 0.06 * k * (0.55 * clamp(spr, 0, 1.2) + 0.9 * arc);
      pose.dy = -h;
      pose.sy = 1 + 0.03 * k * arc - 0.02 * k * clamp(spr - arc, 0, 1);
      pose.sx = 2 - pose.sy;
      pose.rot = Math.sin(m.phase * 0.5) * 0.035 * k * speak;
      pose.anchorBottom = true;
      pose.shadowScale = 1 - clamp(h / (S * 0.3), 0, 0.5);
      break;
    }
    case 'float': {
      // 둥실: 늘 아주 천천히 떠 있고, 목소리에 맞춰 떠오르며 흔들림
      pose.dy = Math.sin(t * 1.3 * sp) * S * 0.012 - S * 0.05 * k * clamp(spr, -0.2, 1.2);
      pose.rot = Math.sin(m.phase * 0.6) * 0.06 * k * speak + Math.sin(t * 0.9 * sp) * 0.012;
      pose.dx = Math.sin(m.phase * 0.3) * S * 0.01 * k * speak;
      pose.shadow = 0.6;
      pose.shadowScale = 0.8 + pose.dy / (S * 0.6);
      break;
    }
    case 'fly': {
      // 날아가기: 목소리에 맞춰 앞으로 나아가며 기수를 들어 올림
      pose.dx = S * 0.065 * k * spr;
      pose.dy = -S * 0.035 * k * spr + Math.sin(t * 2.2 * sp) * S * 0.007 * (0.4 + speak);
      pose.rot = -0.085 * k * spr + Math.sin(m.phase * 0.7) * 0.02 * speak;
      pose.shadow = 0;
      break;
    }
    case 'swim': {
      // 물결: 몸이 물결처럼 휘며 위아래로 헤엄
      pose.dx = S * 0.03 * k * spr;
      pose.dy = Math.sin(m.phase - 0.8) * S * 0.035 * k * speak - S * 0.025 * k * spr;
      pose.rot = Math.sin(m.phase) * 0.1 * k * (0.15 + speak);
      pose.warp = { axis: 'cols', amp: S * (0.004 + 0.02 * k * lvl), freq: 1.1, phase: m.phase * 1.4 };
      pose.shadow = 0;
      break;
    }
    case 'cozy': {
      // 포근: 숨 쉬듯 부풀었다 줄어듦 + 모서리가 살랑
      const br = 0.012 * Math.sin(t * 1.6 * sp) + 0.05 * k * clamp(spr, -0.2, 1.2);
      pose.sx = 1 + br * 0.8;
      pose.sy = 1 + br;
      pose.anchorBottom = true;
      pose.warp = { axis: 'rows', amp: S * (0.003 + 0.016 * k * lvl), freq: 1.2, phase: t * 3 * sp + m.phase };
      break;
    }
    case 'roll': {
      // 굴러가기: 말할 때 살짝 앞으로, 끝나면 제자리
      pose.dx = S * 0.08 * k * spr;
      pose.dy = -Math.abs(Math.sin(m.phase * 1.5)) * S * 0.012 * k * speak;
      pose.rot = -0.02 * k * spr;
      pose.anchorBottom = true;
      break;
    }

    // ───────── 캐릭터 움직임 (그림마다 성격에 맞춘 움직임) ─────────
    case 'bounce': {
      // 통통(사과): 공처럼 튀어 오르고, 바닥에 닿을 때 납작하게 찌그러짐
      const b = Math.abs(Math.sin(m.phase * 0.9)) * speak;
      const arc = pulse > 0.01 ? Math.sin(Math.PI * (1 - pulse)) : 0;
      const contact = Math.pow(1 - Math.abs(Math.sin(m.phase * 0.9)), 6) * speak;
      const h = S * 0.075 * k * (0.75 * b + 0.5 * arc);
      pose.dy = -h;
      pose.sy = 1 - 0.09 * k * contact + 0.03 * k * b;
      pose.sx = 1 + 0.08 * k * contact - 0.02 * k * b;
      pose.anchorBottom = true;
      pose.shadowScale = 1 - clamp(h / (S * 0.25), 0, 0.55);
      break;
    }
    case 'jelly': {
      // 탱글(귤·포도): 젤리처럼 가로세로가 번갈아 탱글탱글 떨림
      const amp = Math.min(0.11, 0.075 * k * (1.0 * pulse + 0.55 * clamp(spr, 0, 1.2) + 0.25 * speak));
      const osc = Math.sin(t * 16 * sp) * amp;
      const idle = 0.006 * Math.sin(t * 2.4 * sp) * (1 - speak);
      pose.sx = 1 + osc + idle;
      pose.sy = 1 - osc - idle;
      pose.anchorBottom = true;
      pose.dy = -Math.abs(osc) * S * 0.25;
      pose.warp = { axis: 'rows', amp: S * 0.016 * k * lvl, freq: 1.5, phase: t * 9 * sp };
      break;
    }
    case 'heavy': {
      // 묵직(수박): 무거워서 천천히 좌우로 흔들리고, 소리에 쿵 하고 눌림
      const th = Math.sin(m.phase * 0.45) * 0.07 * k * speak;
      pose.rot = th;
      pose.dy = -Math.abs(Math.sin(th)) * S * 0.18;
      pose.sy = 1 - 0.05 * k * clamp(spr, 0, 1.2) - 0.03 * k * pulse;
      pose.sx = 1 + 0.045 * k * clamp(spr, 0, 1.2) + 0.03 * k * pulse;
      pose.anchorBottom = true;
      break;
    }
    case 'sway': {
      // 살랑춤(바나나): 아래를 축으로 좌우로 흔들흔들 춤추기
      const sw = Math.sin(m.phase * 0.6);
      pose.rot = sw * 0.13 * k * speak + Math.sin(t * 1.8 * sp) * 0.015;
      pose.dx = sw * S * 0.025 * k * speak;
      pose.sy = 1 + 0.04 * k * clamp(spr, 0, 1.2);
      pose.sx = 1 - 0.02 * k * clamp(spr, 0, 1.2);
      pose.anchorBottom = true;
      break;
    }
    case 'wobbly': {
      // 오뚝이(가지): 소리만큼 크게 기우뚱했다가 되돌아오기
      const amp = 0.16 * k * clamp(spr, 0, 1.2) + 0.012;
      pose.rot = Math.sin(t * 4.4 * sp) * amp;
      pose.sy = 1 - 0.02 * k * pulse;
      pose.anchorBottom = true;
      break;
    }
    case 'sprout': {
      // 쑥쑥(당근): 땅에서 쑥 뽑히듯 길쭉하게 솟아오름, 잎이 살랑
      const up = clamp(spr, -0.1, 1.2);
      pose.dy = -S * 0.09 * k * up;
      pose.sy = 1 + 0.08 * k * up - 0.04 * k * pulse;
      pose.sx = 1 - 0.045 * k * up + 0.03 * k * pulse;
      pose.rot = Math.sin(m.phase * 0.7) * 0.03 * k * speak;
      pose.anchorBottom = true;
      pose.warp = { axis: 'rows', amp: S * (0.002 + 0.01 * k * lvl), freq: 0.9, phase: t * 6 * sp };
      pose.shadowScale = 1 - clamp(up * 0.35, 0, 0.4);
      break;
    }
    case 'popcorn': {
      // 톡톡(옥수수): 팝콘 튀듯 짧게 톡톡 뛰며 바르르 떨림
      const arc = pulse > 0.01 ? Math.sin(Math.PI * (1 - pulse)) : 0;
      const jit = lvl * k;
      pose.dx = (Math.sin(t * 47) + Math.sin(t * 31)) * S * 0.005 * jit;
      pose.dy = -S * 0.06 * k * arc - S * 0.012 * k * clamp(spr, 0, 1.2);
      pose.rot = Math.sin(t * 39) * 0.035 * jit;
      pose.sy = 1 + 0.03 * k * arc;
      pose.sx = 1 - 0.02 * k * arc;
      pose.anchorBottom = true;
      break;
    }
    case 'heartbeat': {
      // 두근(딸기): 하트처럼 "두-근" 박자로 커졌다 작아짐
      const beat = Math.pow(Math.max(0, Math.sin(m.phase * 1.1)), 8) + 0.6 * Math.pow(Math.max(0, Math.sin(m.phase * 1.1 - 0.9)), 8);
      const sc = 1 + 0.07 * k * pulse + 0.035 * k * clamp(spr, 0, 1.2) + 0.05 * k * beat * speak + 0.006 * Math.sin(t * 2 * sp);
      pose.sx = sc;
      pose.sy = sc;
      pose.rot = Math.sin(m.phase * 0.4) * 0.03 * k * speak;
      break;
    }
    case 'tumble': {
      // 데굴(도토리): 좌우로 데굴데굴 구르듯 기울며 움직임
      const r = Math.sin(m.phase * 0.7) * 0.22 * k * speak;
      const arc = pulse > 0.01 ? Math.sin(Math.PI * (1 - pulse)) : 0;
      pose.rot = r;
      pose.dx = r * S * 0.32;
      pose.dy = -S * 0.035 * k * arc;
      break;
    }
    case 'bunny': {
      // 깡총(토끼): 높이 깡총 뛰고, 뛸 때 길쭉 → 착지할 때 납작
      const hp = Math.max(0, Math.sin(m.phase * 0.8));
      const arc = pulse > 0.01 ? Math.sin(Math.PI * (1 - pulse)) : 0;
      const contact = Math.pow(1 - hp, 5) * speak;
      const h = S * 0.12 * k * (0.8 * hp * speak + 0.5 * arc);
      pose.dy = -h;
      pose.sy = 1 + 0.07 * k * hp * speak - 0.07 * k * contact;
      pose.sx = 1 - 0.04 * k * hp * speak + 0.06 * k * contact;
      pose.rot = -0.05 * k * hp * speak;
      pose.anchorBottom = true;
      pose.shadowScale = 1 - clamp(h / (S * 0.25), 0, 0.55);
      break;
    }
    case 'waddle': {
      // 뒤뚱(곰): 양발로 번갈아 디디며 좌우로 뒤뚱뒤뚱
      const th = Math.sin(m.phase * 0.55) * 0.1 * k * (0.15 + 0.85 * speak);
      pose.rot = th;
      pose.dy = -Math.abs(Math.sin(th)) * S * 0.22;
      pose.dx = Math.sin(m.phase * 0.55) * S * 0.015 * k * speak;
      pose.sy = 1 - 0.03 * k * clamp(spr, 0, 1.2);
      pose.sx = 1 + 0.03 * k * clamp(spr, 0, 1.2);
      pose.anchorBottom = true;
      break;
    }
    case 'stretch': {
      // 기지개(고양이): 몸을 위로 쭉 늘이고, 느긋하게 기울었다 돌아옴
      const st = clamp(spr, -0.1, 1.2);
      pose.sy = 1 + 0.08 * k * st + 0.008 * Math.sin(t * 1.5 * sp);
      pose.sx = 1 - 0.04 * k * st;
      pose.rot = Math.sin(m.phase * 0.35) * 0.06 * k * speak;
      pose.anchorBottom = true;
      pose.warp = { axis: 'rows', amp: S * (0.002 + 0.008 * k * lvl), freq: 0.8, phase: t * 4 * sp };
      break;
    }
    case 'wag': {
      // 신나(강아지): 신나서 몸을 빠르게 흔들고 살짝살짝 뜀
      const arc = pulse > 0.01 ? Math.sin(Math.PI * (1 - pulse)) : 0;
      const amp = 0.08 * k * (0.35 * speak + 0.65 * lvl) + 0.012;
      pose.rot = Math.sin(t * 17 * sp) * amp;
      pose.dy = -S * 0.05 * k * arc - S * 0.02 * k * clamp(spr, 0, 1.2);
      pose.sy = 1 + 0.025 * k * arc;
      pose.sx = 1 - 0.015 * k * arc;
      pose.anchorBottom = true;
      break;
    }
    case 'nod': {
      // 끄덕(소): 얼굴 쪽으로 기울며 느릿하게 고개를 끄덕
      pose.rot = -0.08 * k * clamp(spr, 0, 1.2) + Math.sin(m.phase * 0.5) * 0.045 * k * speak;
      pose.sy = 1 - 0.025 * k * clamp(spr, 0, 1.2);
      pose.sx = 1 + 0.015 * k * clamp(spr, 0, 1.2);
      pose.dy = Math.sin(t * 1.2 * sp) * S * 0.003;
      pose.anchorBottom = true;
      break;
    }
    case 'scurry': {
      // 쪼르르(다람쥐): 작고 빠르게 콩콩, 고개를 갸웃갸웃
      const hp = Math.max(0, Math.sin(m.phase * 1.7));
      const arc = pulse > 0.01 ? Math.sin(Math.PI * (1 - pulse)) : 0;
      const h = S * 0.045 * k * (hp * speak + 0.6 * arc);
      pose.dy = -h;
      pose.rot = Math.sin(m.phase * 0.9) * 0.07 * k * speak;
      pose.dx = Math.sin(t * 29) * S * 0.003 * k * lvl;
      pose.sy = 1 + 0.03 * k * hp * speak;
      pose.sx = 1 - 0.02 * k * hp * speak;
      pose.anchorBottom = true;
      pose.shadowScale = 1 - clamp(h / (S * 0.25), 0, 0.4);
      break;
    }
    case 'leap': {
      // 첨벙(돌고래): 물 위로 뛰어올라 오를 땐 머리를 들고, 내려올 땐 숙임
      const j = m.phase * 0.38;
      const u = Math.sin(j);
      pose.dy = -S * 0.13 * k * speak * Math.max(0, u) - S * 0.03 * k * clamp(spr, 0, 1.2);
      pose.rot = -Math.cos(j) * 0.22 * k * speak * (u > 0 ? 1 : 0.3);
      pose.dx = S * 0.03 * k * clamp(spr, 0, 1.2);
      pose.warp = { axis: 'cols', amp: S * (0.003 + 0.012 * k * lvl), freq: 1, phase: m.phase * 1.2 };
      pose.shadow = 0;
      break;
    }
    case 'rock': {
      // 흔들(달): 요람처럼 흔들흔들, 목소리에 살짝 떠오름
      pose.rot = Math.sin(t * 1.3 * sp) * 0.035 + Math.sin(m.phase * 0.5) * 0.15 * k * speak;
      pose.dy = -S * 0.035 * k * clamp(spr, 0, 1.2) + Math.sin(t * 1.1 * sp) * S * 0.006;
      pose.anchorBottom = true;
      pose.shadow = 0.5;
      break;
    }
  }

  // 최대 이동 범위 제한
  pose.dx = clamp(pose.dx, -S * 0.16, S * 0.16);
  pose.dy = clamp(pose.dy, -S * 0.16, S * 0.12);
  pose.rot = clamp(pose.rot, -0.3, 0.3);

  // ── 뒤쪽 효과
  if (a.effects && a.type === 'fly') drawClouds(ctx, S, cx, cy, m, k);

  // ── 바닥 그림자
  if (pose.shadow > 0) {
    ctx.save();
    ctx.globalAlpha *= pose.shadow;
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    const sw = dw * 0.36 * clamp(pose.shadowScale, 0.4, 1.2) * (pose.sx || 1);
    ctx.ellipse(bx + pose.dx * 0.8, by + dh / 2 + S * 0.025, sw, S * 0.028 * clamp(pose.shadowScale, 0.4, 1.2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── 그림
  ctx.save();
  if (pose.anchorBottom) {
    ctx.translate(bx + pose.dx, by + dh / 2 + pose.dy);
    ctx.rotate(pose.rot);
    ctx.scale(pose.sx, pose.sy);
    ctx.translate(0, -dh / 2);
  } else {
    ctx.translate(bx + pose.dx, by + pose.dy);
    ctx.rotate(pose.rot);
    ctx.scale(pose.sx, pose.sy);
  }
  if (pose.warp) drawWarped(ctx, prep.img, -dw / 2, -dh / 2, dw, dh, pose.warp);
  else ctx.drawImage(prep.img, -dw / 2, -dh / 2, dw, dh);
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

  // ── 앞쪽 효과
  const left = bx + pose.dx - dw / 2;
  const top = by + pose.dy - dh / 2;
  if (a.effects) {
    if (a.type === 'fly') drawWind(ctx, S, left, by + pose.dy, m, k);
    if (a.type === 'roll') drawRollLines(ctx, S, left, by + dh / 2, m, k);
    if (a.type === 'float') drawRings(ctx, S, bx + pose.dx, by + pose.dy, Math.max(dw, dh), m);
    if (a.type === 'swim') drawWater(ctx, S, bx, by + dh * 0.42, dw, m);
    if (POP_TYPES.has(a.type)) drawPops(ctx, S, bx + pose.dx, top, dw, m);
    if (a.type === 'cozy') drawPuffs(ctx, S, bx, top, dw, m);
    if (THUD_TYPES.has(a.type)) drawThud(ctx, S, bx, by + dh / 2, dw, m);
    if (a.type === 'leap') drawWater(ctx, S, bx, by + dh * 0.42, dw, m);
    if (a.type === 'rock') drawRings(ctx, S, bx + pose.dx, by + pose.dy, Math.max(dw, dh), m);
  }
  if (a.sparkles) {
    if (a.type === 'cozy' || a.type === 'heartbeat') drawHearts(ctx, S, bx, top, dw, m);
    else if (a.type === 'swim' || a.type === 'leap') drawBubbles(ctx, S, bx + pose.dx + dw * 0.35, top + dh * 0.2, m);
    else drawStars(ctx, S, bx + pose.dx, by + pose.dy, Math.max(dw, dh), m);
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
  const N = 28;
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

function drawStars(ctx: CanvasRenderingContext2D, S: number, cx: number, cy: number, D: number, m: MotionFrame) {
  const sp = clamp(m.speak, 0, 1);
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
const POP_TYPES = new Set<string>(['hop', 'squish', 'bounce', 'jelly', 'sprout', 'popcorn', 'heartbeat', 'tumble', 'bunny', 'wag', 'scurry', 'sway', 'wobbly', 'stretch']);
/** 무겁게 쿵 하는 움직임들: 바닥에 먼지가 폴폴 */
const THUD_TYPES = new Set<string>(['heavy', 'waddle', 'nod']);

function drawThud(ctx: CanvasRenderingContext2D, S: number, cx: number, bottom: number, w: number, m: MotionFrame) {
  const p = clamp(m.pulse, 0, 1);
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
