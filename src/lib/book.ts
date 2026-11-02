import { paperGrain } from './images';
import type { MotionFrame } from './motion';
import { captionProgress, IDLE_FRAME } from './motion';
import { COLORS, drawBackground, drawIllustration } from './render';
import { buildTimeline, itemFrame, type Timeline, type TimelineItem } from './timeline';

/**
 * 그림책 잇기: 여러 기록을 그림책처럼 한 장씩 넘기며 보여줍니다.
 * 미리보기와 저장 영상이 이 코드 하나로 똑같이 그려져요.
 *
 * 흐름(기록마다): 목소리 → 0.7초 쉼 → 책장 넘김(1.1초) → 잠깐 멈춤 → 다음 기록 목소리
 * 자막(아이가 한 말)은 목소리가 나오는 동안 한 글자씩 나타나요.
 *
 * 책 모양 3가지 (나중에 더 추가하기 쉽도록 모양만 따로 나눔)
 *  - page     (C) 한 페이지: 그림 위·글 아래, 오른쪽 아래 모서리가 접히며 왼쪽으로 넘어감
 *  - spread   (A) 좌우 펼친 책: 왼쪽 그림·오른쪽 글, 오른쪽 페이지가 책등을 축으로 넘어감
 *  - vertical (B) 위아래 펼친 책: 위 그림·아래 글, 아래 페이지가 고리를 축으로 위로 넘어감
 */

export type BookLayout = 'page' | 'spread' | 'vertical';

export const BOOK_LAYOUTS: { v: BookLayout; label: string; desc: string }[] = [
  { v: 'page', label: '한 페이지', desc: '그림 위·글 아래, 크게 보여요' },
  { v: 'spread', label: '좌우 펼친 책', desc: '진짜 그림책처럼 펼쳐져요' },
  { v: 'vertical', label: '위아래 펼친 책', desc: '휴대폰을 꽉 채워요' },
];

const LEAD = 0.6; // 첫 장을 보여주고 목소리 시작까지
const HOLD = 0.7; // 목소리가 끝나고 책장을 넘기기 전 쉼
const TURN = 1.1; // 책장 넘기는 시간
const SETTLE = 0.3; // 넘긴 뒤 다음 목소리까지
const TAIL = 1.4; // 마지막 장을 보여주는 시간

const PAPER = '#FFFDF7';
const PAPER_BACK = '#F7F0E2';
const EDGE = '#EFE5D2';

interface BookData {
  tl: Timeline;
  texts: string[];
  layout: BookLayout;
  turnStart: number[];
}

export function buildBookTimeline(items: TimelineItem[], texts: string[], layout: BookLayout): Timeline {
  const tl = buildTimeline(items, LEAD, HOLD + TURN + SETTLE, TAIL);
  const turnStart = items.map((it, i) => tl.offsets[i] + Math.max(0.05, it.trimEnd - it.trimStart) + HOLD);
  const data: BookData = { tl, texts, layout, turnStart };
  return { ...tl, draw: (ctx, W, H, t, idleNow) => drawBook(ctx, W, H, data, t, idleNow) };
}

// ───────── 공통 도우미 ─────────

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 페이지 한 면에 무엇을 그릴지 */
type Face = { picture?: number; text?: number } & { spine: 'left' | 'right' | 'top' | 'bottom' };

interface PageState {
  frame: MotionFrame;
  reveal: number;
}

/** 시각 t에 기록 i의 그림 움직임과 자막이 나타난 정도 */
function pageState(d: BookData, i: number, t: number, idleNow?: number): PageState {
  if (idleNow !== undefined) return { frame: { ...IDLE_FRAME, t: idleNow }, reveal: 1 };
  const it = d.tl.items[i];
  const o = d.tl.offsets[i];
  const frame = itemFrame(it, o, t);
  const fv = it.track.firstVoice >= it.trimStart && it.track.firstVoice <= it.trimEnd ? it.track.firstVoice : it.trimStart + 0.1;
  const start = o + (fv - it.trimStart);
  // 아이가 말하는 동안에 맞춰 한 글자씩 (한 장짜리 영상 자막과 같은 계산)
  const lv = Math.min(it.track.lastVoice, it.trimEnd);
  const n = Array.from(d.texts[i] ?? '').length;
  return { frame, reveal: captionProgress(t - start + fv, fv, lv, n) };
}

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, rad: [number, number, number, number]) {
  const [tl, tr, br, bl] = rad;
  const { x, y, w, h } = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/** 책등 쪽 모서리는 각지게, 바깥쪽은 둥글게 */
function cornerRadii(spine: Face['spine'], r: number): [number, number, number, number] {
  const s = r * 0.25;
  if (spine === 'left') return [s, r, r, s];
  if (spine === 'right') return [r, s, s, r];
  if (spine === 'top') return [s, s, r, r];
  return [r, r, s, s];
}

/** 종이 한 면: 바탕 + 책등 그림자 + (그림) + (자막). (0,0)~(w,h) 좌표로 그림 */
function drawFace(ctx: CanvasRenderingContext2D, w: number, h: number, face: Face, d: BookData, t: number, idleNow: number | undefined, W: number) {
  const r: Rect = { x: 0, y: 0, w, h };
  ctx.save();
  roundRectPath(ctx, r, cornerRadii(face.spine, W * 0.03));
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  // 종이 결
  ctx.save();
  ctx.globalAlpha = 0.18;
  const pat = ctx.createPattern(paperGrain(), 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  // 책등 쪽 그림자 (안쪽으로 휘어 들어간 느낌)
  const sd = (face.spine === 'left' || face.spine === 'right' ? w : h) * 0.09;
  let g: CanvasGradient;
  if (face.spine === 'left') g = ctx.createLinearGradient(0, 0, sd, 0);
  else if (face.spine === 'right') g = ctx.createLinearGradient(w, 0, w - sd, 0);
  else if (face.spine === 'top') g = ctx.createLinearGradient(0, 0, 0, sd);
  else g = ctx.createLinearGradient(0, h, 0, h - sd);
  g.addColorStop(0, 'rgba(140,105,60,0.22)');
  g.addColorStop(1, 'rgba(140,105,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const both = face.picture !== undefined && face.text !== undefined;
  if (face.picture !== undefined) {
    const i = face.picture;
    const it = d.tl.items[i];
    const st = pageState(d, i, t, idleNow);
    if (it.scene.prepared) {
      const S = both ? Math.min(w * 0.84, h * 0.52) : Math.min(w * 0.86, h * 0.78);
      const cy = both ? h * 0.37 : h * 0.5;
      drawIllustration(ctx, S, w / 2, cy, it.scene.prepared, it.scene.transform, it.scene.anim, st.frame);
    }
  }
  if (face.text !== undefined) {
    const i = face.text;
    const st = pageState(d, i, t, idleNow);
    const area: Rect = both ? { x: w * 0.08, y: h * 0.66, w: w * 0.84, h: h * 0.26 } : { x: w * 0.1, y: h * 0.12, w: w * 0.8, h: h * 0.76 };
    drawSaying(ctx, d.texts[i] ?? '', area, st.reveal, W);
  }
  ctx.restore();
}

// ───────── 자막: 아이가 한 말 (귀여운 둥근 글씨, 한 글자씩) ─────────

const FONT = (px: number) => `${px}px Jua, "Gowun Dodum", sans-serif`;

/** 가장 크게 들어가는 크기와 줄 나눔 (띄어쓰기에서만 줄을 바꾸고, 안 되면 글자 단위로) */
function layoutSaying(ctx: CanvasRenderingContext2D, text: string, area: Rect, W: number): { lines: string[]; px: number } {
  const maxPx = Math.min(area.h * 0.62, W * 0.16);
  const minPx = W * 0.06;
  const words = text.split(/\s+/).filter(Boolean);
  const fits = (lines: string[], px: number) => {
    ctx.font = FONT(px);
    return lines.every((l) => ctx.measureText(l).width <= area.w) && lines.length * px * 1.25 <= area.h;
  };
  const candidates: string[][] = [[text]];
  if (words.length > 1) {
    // 두 줄로 나누는 가장 고른 지점
    let best: string[] | null = null;
    let bestDiff = Infinity;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const diff = Math.abs(a.length - b.length);
      if (diff < bestDiff) (bestDiff = diff), (best = [a, b]);
    }
    if (best) candidates.push(best);
    if (words.length > 2) {
      const per = Math.ceil(words.length / 3);
      candidates.push([0, 1, 2].map((j) => words.slice(j * per, (j + 1) * per).join(' ')).filter(Boolean));
    }
  }
  for (let px = maxPx; px >= minPx; px *= 0.94) {
    for (const lines of candidates) if (fits(lines, px)) return { lines, px };
  }
  // 띄어쓰기 없이 긴 말: 글자 단위로 두 줄
  const chars = Array.from(text);
  const half = Math.ceil(chars.length / 2);
  const two = [chars.slice(0, half).join(''), chars.slice(half).join('')];
  for (let px = maxPx; px >= minPx * 0.8; px *= 0.94) if (fits(two, px)) return { lines: two, px };
  return { lines: two, px: minPx * 0.8 };
}

function drawSaying(ctx: CanvasRenderingContext2D, text: string, area: Rect, reveal: number, W: number) {
  if (!text.trim() || reveal <= 0) return;
  const { lines, px } = layoutSaying(ctx, text, area, W);
  const total = lines.reduce((n, l) => n + Array.from(l).length, 0);
  const shown = reveal * total;
  ctx.font = FONT(px);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const lh = px * 1.25;
  const y0 = area.y + area.h / 2 - (lines.length * lh) / 2 + px * 0.95;
  let k = 0;
  lines.forEach((line, li) => {
    const chars = Array.from(line);
    const lw = ctx.measureText(line).width;
    const x0 = area.x + area.w / 2 - lw / 2;
    const y = y0 + li * lh;
    // 형광펜 밑줄: 나타난 글자만큼 늘어남
    const nShown = clamp(shown - k, 0, chars.length);
    if (nShown > 0) {
      const hw = ctx.measureText(chars.slice(0, Math.ceil(nShown)).join('')).width;
      ctx.fillStyle = 'rgba(246, 205, 76, 0.45)';
      roundRectPath(ctx, { x: x0 - px * 0.12, y: y - px * 0.34, w: hw + px * 0.24, h: px * 0.38 }, [px * 0.18, px * 0.18, px * 0.18, px * 0.18]);
      ctx.fill();
    }
    chars.forEach((ch, ci) => {
      const a = clamp(shown - (k + ci), 0, 1);
      if (a <= 0) return;
      const cx = x0 + ctx.measureText(chars.slice(0, ci).join('')).width;
      const cw = ctx.measureText(ch).width;
      // 막 나타난 글자는 톡 튀어나오듯
      const pop = a < 1 ? 0.55 + 0.45 * Math.sin((a * Math.PI) / 2) + 0.12 * Math.sin(a * Math.PI) : 1;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, a * 1.6);
      ctx.translate(cx + cw / 2, y - px * 0.35);
      ctx.scale(pop, pop);
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(ch, -cw / 2, px * 0.35);
      ctx.restore();
    });
    k += chars.length;
  });
}

// ───────── 장면 ─────────

function drawDesk(ctx: CanvasRenderingContext2D, W: number, H: number) {
  drawBackground(ctx, W, H);
  // 가장자리가 살짝 어두운 책상 느낌
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(120,90,55,0)');
  g.addColorStop(1, 'rgba(120,90,55,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function shadowed(ctx: CanvasRenderingContext2D, W: number, fn: () => void) {
  ctx.save();
  ctx.shadowColor = 'rgba(110,80,50,0.25)';
  ctx.shadowBlur = W * 0.03;
  ctx.shadowOffsetY = W * 0.012;
  fn();
  ctx.restore();
}

/** 현재 보여줄 기록과 넘김 진행 정도 */
function where(d: BookData, t: number): { i: number; turn: number } {
  const n = d.tl.items.length;
  for (let i = 0; i < n - 1; i++) {
    const ts = d.turnStart[i];
    if (t < ts) return { i, turn: 0 };
    if (t < ts + TURN) return { i, turn: easeInOut((t - ts) / TURN) };
  }
  return { i: n - 1, turn: 0 };
}

function drawBook(ctx: CanvasRenderingContext2D, W: number, H: number, d: BookData, t: number, idleNow?: number) {
  drawDesk(ctx, W, H);
  if (!d.tl.items.length) return;
  const { i, turn } = idleNow !== undefined ? { i: 0, turn: 0 } : where(d, t);
  if (d.layout === 'page') drawPageLayout(ctx, W, H, d, t, idleNow, i, turn);
  else drawSpreadLayout(ctx, W, H, d, t, idleNow, i, turn, d.layout === 'spread' ? 'v' : 'h');
}

// ── C. 한 페이지 + 모서리 접힘 ──

function drawPageLayout(ctx: CanvasRenderingContext2D, W: number, H: number, d: BookData, t: number, idleNow: number | undefined, i: number, turn: number) {
  const P: Rect = { x: W * 0.075, y: H * 0.05, w: W * 0.855, h: H * 0.9 };
  const n = d.tl.items.length;
  // 아래에 남은 종이 (남은 장 수만큼, 최대 3장)
  const left = Math.min(3, n - 1 - i);
  for (let k = left; k >= 1; k--) {
    ctx.fillStyle = k % 2 ? EDGE : '#F4EBDA';
    roundRectPath(ctx, { x: P.x + k * W * 0.007, y: P.y + k * W * 0.004, w: P.w, h: P.h }, cornerRadii('left', W * 0.03));
    ctx.fill();
  }
  const face = (j: number): Face => ({ picture: j, text: j, spine: 'left' });
  const draw = (j: number) => {
    ctx.save();
    ctx.translate(P.x, P.y);
    drawFace(ctx, P.w, P.h, face(j), d, t, idleNow, W);
    ctx.restore();
  };
  if (turn <= 0 || i >= n - 1) {
    shadowed(ctx, W, () => {
      ctx.fillStyle = PAPER;
      roundRectPath(ctx, P, cornerRadii('left', W * 0.03));
      ctx.fill();
    });
    draw(i);
    return;
  }
  // 다음 장(밑에서 드러남)
  shadowed(ctx, W, () => {
    ctx.fillStyle = PAPER;
    roundRectPath(ctx, P, cornerRadii('left', W * 0.03));
    ctx.fill();
  });
  draw(i + 1);

  // 접히는 선: 오른쪽 아래 모서리(C)가 점 Q로 끌려가며, 선은 C와 Q의 수직이등분선
  const C = { x: P.x + P.w, y: P.y + P.h };
  const Q = { x: lerp(C.x, P.x - P.w * 1.28, turn), y: C.y - Math.sin(Math.PI * turn) * P.h * 0.2 - turn * P.h * 0.04 };
  const M = { x: (C.x + Q.x) / 2, y: (C.y + Q.y) / 2 };
  let nx = C.x - Q.x, ny = C.y - Q.y;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  const side = (p: { x: number; y: number }) => (p.x - M.x) * nx + (p.y - M.y) * ny; // >0: 들린 쪽
  const rect = [
    { x: P.x, y: P.y },
    { x: P.x + P.w, y: P.y },
    { x: P.x + P.w, y: P.y + P.h },
    { x: P.x, y: P.y + P.h },
  ];
  const keep = clipPoly(rect, (p) => -side(p));
  const lifted = clipPoly(rect, side);
  const reflect = (p: { x: number; y: number }) => {
    const s = side(p);
    return { x: p.x - 2 * s * nx, y: p.y - 2 * s * ny };
  };
  const flap = lifted.map(reflect);

  // 드러난 다음 장 위에 접힌 종이 그림자
  if (lifted.length > 2) {
    ctx.save();
    polyPath(ctx, lifted);
    ctx.clip();
    const sg = ctx.createLinearGradient(M.x, M.y, M.x + nx * P.w * 0.14, M.y + ny * P.w * 0.14);
    sg.addColorStop(0, 'rgba(90,60,30,0.28)');
    sg.addColorStop(1, 'rgba(90,60,30,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // 아직 안 넘어간 부분의 현재 장
  if (keep.length > 2) {
    ctx.save();
    polyPath(ctx, keep);
    ctx.clip();
    draw(i);
    ctx.restore();
  }
  // 넘어가는 종이 뒷면
  if (flap.length > 2) {
    ctx.save();
    ctx.shadowColor = 'rgba(90,60,30,0.3)';
    ctx.shadowBlur = W * 0.035;
    ctx.shadowOffsetX = -W * 0.01;
    polyPath(ctx, flap);
    ctx.fillStyle = PAPER_BACK;
    ctx.fill();
    ctx.restore();
    ctx.save();
    polyPath(ctx, flap);
    ctx.clip();
    // 접힌 곳은 밝고(둥글게 말린 빛), 바깥쪽으로 갈수록 살짝 어두움
    const fg = ctx.createLinearGradient(M.x, M.y, M.x - nx * P.w * 0.6, M.y - ny * P.w * 0.6);
    fg.addColorStop(0, 'rgba(255,255,255,0.65)');
    fg.addColorStop(0.12, 'rgba(255,255,255,0.1)');
    fg.addColorStop(1, 'rgba(120,90,50,0.16)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

type Pt = { x: number; y: number };
/** 다각형을 f(p) >= 0 인 쪽으로 자르기 */
function clipPoly(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const u = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    }
  }
  return out;
}
function polyPath(ctx: CanvasRenderingContext2D, poly: Pt[]) {
  ctx.beginPath();
  poly.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

// ── A·B. 펼친 책 + 원근감 있는 뒤집기 ──

let off: HTMLCanvasElement | null = null;
function offscreen(w: number, h: number) {
  if (!off) off = document.createElement('canvas');
  const W = Math.ceil(w), H = Math.ceil(h);
  if (off.width !== W || off.height !== H) {
    off.width = W;
    off.height = H;
  }
  return off;
}

/**
 * axis 'v': 왼쪽(그림)·오른쪽(글), 세로 책등. 오른쪽 장이 왼쪽으로 넘어감
 * axis 'h': 위(그림)·아래(글), 가로 책등(고리). 아래 장이 위로 넘어감
 */
function drawSpreadLayout(ctx: CanvasRenderingContext2D, W: number, H: number, d: BookData, t: number, idleNow: number | undefined, i: number, turn: number, axis: 'v' | 'h') {
  let A: Rect, B: Rect; // A: 그림 장(왼쪽/위), B: 글 장(오른쪽/아래)
  if (axis === 'v') {
    const bw = W * 0.92, ph = Math.min(H * 0.42, (bw / 2) * 1.45);
    const x0 = (W - bw) / 2, y0 = H * 0.5 - ph / 2;
    A = { x: x0, y: y0, w: bw / 2, h: ph };
    B = { x: x0 + bw / 2, y: y0, w: bw / 2, h: ph };
  } else {
    const bw = W * 0.88, top = H * 0.045, bot = H * 0.955, sp = top + (bot - top) * 0.56;
    A = { x: (W - bw) / 2, y: top, w: bw, h: sp - top };
    B = { x: (W - bw) / 2, y: sp, w: bw, h: bot - sp };
  }
  const spA: Face['spine'] = axis === 'v' ? 'right' : 'bottom';
  const spB: Face['spine'] = axis === 'v' ? 'left' : 'top';
  const r = W * 0.03;
  const drawAt = (R: Rect, face: Face) => {
    ctx.save();
    ctx.translate(R.x, R.y);
    drawFace(ctx, R.w, R.h, face, d, t, idleNow, W);
    ctx.restore();
  };
  // 책 그림자 + 바닥 종이 두께
  shadowed(ctx, W, () => {
    ctx.fillStyle = EDGE;
    roundRectPath(ctx, A, cornerRadii(spA, r));
    ctx.fill();
    roundRectPath(ctx, B, cornerRadii(spB, r));
    ctx.fill();
  });
  const n = d.tl.items.length;
  const turning = turn > 0 && i < n - 1;
  // 그림 장: 넘기는 동안 아래에는 아직 지금 그림
  drawAt(A, { picture: i, spine: spA });
  // 글 장: 넘기는 동안 아래에서 다음 장의 (아직 빈) 글 장이 드러남
  drawAt(B, { text: turning ? i + 1 : i, spine: spB });
  if (axis === 'h') drawRings(ctx, A, B, W);
  else drawSpine(ctx, A, B, W);
  if (!turning) return;

  // 넘어가는 장: 앞면 = 지금 글 장(B), 뒷면 = 다음 그림 장(A 자리에 놓임)
  const th = Math.PI * turn;
  const c = Math.cos(th);
  const front = c > 0;
  const R = front ? B : A;
  const face: Face = front ? { text: i, spine: spB } : { picture: i + 1, spine: spA };
  const cv = offscreen(R.w, R.h);
  const g = cv.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  drawFace(g, R.w, R.h, face, d, t, idleNow, W);

  // 원근: 책등에서 거리 dist인 곳은 화면에서 dist*|cos|, 앞으로 다가온 만큼(z) 크게
  const N = 28;
  const len = axis === 'v' ? R.w : R.h;
  const Dp = len * 4.5;

  // 넘어가는 종이가 아래 장에 드리우는 그림자: 책등 쪽이 가장 진하고 바깥으로 갈수록 흐려짐
  {
    const covered = front ? B : A;
    const reach = len * (0.25 + 0.75 * Math.abs(Math.cos(th))) * 1.15; // 종이가 덮은 만큼 + 조금 더
    const amt = 0.3 * Math.sin(th);
    ctx.save();
    roundRectPath(ctx, covered, cornerRadii(front ? spB : spA, r));
    ctx.clip();
    let g: CanvasGradient;
    if (axis === 'v') g = front ? ctx.createLinearGradient(B.x, 0, B.x + reach, 0) : ctx.createLinearGradient(B.x, 0, B.x - reach, 0);
    else g = front ? ctx.createLinearGradient(0, B.y, 0, B.y + reach) : ctx.createLinearGradient(0, B.y, 0, B.y - reach);
    g.addColorStop(0, `rgba(90,60,30,${amt.toFixed(3)})`);
    g.addColorStop(0.7, `rgba(90,60,30,${(amt * 0.35).toFixed(3)})`);
    g.addColorStop(1, 'rgba(90,60,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(covered.x, covered.y, covered.w, covered.h);
    ctx.restore();
  }
  const z = (dist: number) => dist * Math.sin(th);
  const f = (dist: number) => Dp / (Dp - z(dist));
  const ac = Math.abs(c);
  for (let k = 0; k < N; k++) {
    // dist: 책등에서 바깥쪽으로
    const d0 = (len * k) / N, d1 = (len * (k + 1)) / N;
    const fm = f((d0 + d1) / 2);
    if (axis === 'v') {
      const spineX = B.x;
      // 앞면(B): 책등에서 오른쪽으로 dist / 뒷면(A): 책등에서 왼쪽으로 dist
      const sx0 = front ? d0 : R.w - d1;
      const x0 = front ? spineX + d0 * ac * f(d0) : spineX - d1 * ac * f(d1);
      const x1 = front ? spineX + d1 * ac * f(d1) : spineX - d0 * ac * f(d0);
      const hgt = R.h * fm;
      ctx.drawImage(cv, sx0, 0, d1 - d0 + 0.6, R.h, Math.min(x0, x1), R.y + R.h / 2 - hgt / 2, Math.abs(x1 - x0) + 0.6, hgt);
    } else {
      const spineY = B.y;
      const sy0 = front ? d0 : R.h - d1;
      const y0 = front ? spineY + d0 * ac * f(d0) : spineY - d1 * ac * f(d1);
      const y1 = front ? spineY + d1 * ac * f(d1) : spineY - d0 * ac * f(d0);
      const wid = R.w * fm;
      ctx.drawImage(cv, 0, sy0, R.w, d1 - d0 + 0.6, R.x + R.w / 2 - wid / 2, Math.min(y0, y1), wid, Math.abs(y1 - y0) + 0.6);
    }
  }
  // 종이가 세워질수록 어두워지는 빛 (책등 쪽은 덜, 바깥 끝은 더)
  const dark = (1 - ac) * 0.24;
  if (dark > 0.01) {
    ctx.save();
    if (axis === 'v') {
      const ext = R.w * ac * f(R.w);
      const hgt = R.h * f(R.w);
      const x0 = front ? B.x : B.x - ext;
      const g = ctx.createLinearGradient(B.x, 0, front ? B.x + ext : B.x - ext, 0);
      g.addColorStop(0, `rgba(80,55,30,${(dark * 0.4).toFixed(3)})`);
      g.addColorStop(1, `rgba(80,55,30,${dark.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(x0, R.y + R.h / 2 - hgt / 2, ext, hgt);
    } else {
      const ext = R.h * ac * f(R.h);
      const wid = R.w * f(R.h);
      const y0 = front ? B.y : B.y - ext;
      const g = ctx.createLinearGradient(0, B.y, 0, front ? B.y + ext : B.y - ext);
      g.addColorStop(0, `rgba(80,55,30,${(dark * 0.4).toFixed(3)})`);
      g.addColorStop(1, `rgba(80,55,30,${dark.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(R.x + R.w / 2 - wid / 2, y0, wid, ext);
    }
    ctx.restore();
  }
  if (axis === 'h') drawRings(ctx, A, B, W);
}

function drawSpine(ctx: CanvasRenderingContext2D, A: Rect, B: Rect, W: number) {
  const x = B.x;
  const g = ctx.createLinearGradient(x - W * 0.02, 0, x + W * 0.02, 0);
  g.addColorStop(0, 'rgba(120,90,50,0)');
  g.addColorStop(0.5, 'rgba(120,90,50,0.22)');
  g.addColorStop(1, 'rgba(120,90,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - W * 0.02, A.y, W * 0.04, A.h);
}

function drawRings(ctx: CanvasRenderingContext2D, A: Rect, B: Rect, W: number) {
  const y = B.y;
  const n = 7;
  ctx.save();
  for (let k = 0; k < n; k++) {
    const x = A.x + A.w * (0.12 + (0.76 * k) / (n - 1));
    ctx.fillStyle = '#CDBFA8';
    roundRectPath(ctx, { x: x - W * 0.011, y: y - W * 0.026, w: W * 0.022, h: W * 0.052 }, [W * 0.011, W * 0.011, W * 0.011, W * 0.011]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x - W * 0.004, y - W * 0.02, W * 0.004, W * 0.03);
  }
  ctx.restore();
}
