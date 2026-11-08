/**
 * 아이 얼굴에서 눈·입을 찾아 오려 내고, 그림체에 어울리게 바꾸는 곳.
 *
 * - 얼굴 인식은 MediaPipe Face Landmarker를 휴대폰 안에서만 실행해요(엔진·모델 모두 이 앱 안의 파일).
 *   카메라 영상·사진은 어디에도 보내지 않고, 원본 얼굴 영상은 저장하지 않아요.
 * - 피부는 빼고 눈(흰자·눈동자·눈꺼풀 선)과 입(입술·입속)만, 가장자리를 부드럽게 오려요.
 * - "실사 정도"(level) 0 = 그림에 가깝게 ↔ 1 = 실제에 가깝게: 색을 그림 팔레트로, 흰자는 종이색,
 *   어두운 곳은 그림 선 색으로, 종이 질감·그림 선을 덧입혀 징그럽지 않게 해요.
 * - 고개를 기울여도 눈·입이 바르게 오도록 얼굴 기울기를 되돌려 오려요. 떨림은 부드럽게 걸러요.
 */
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { paperGrain, type Prepared } from './images';

// ───────── 눈·입 모양 맞추기 (시안 화면에서 조절해 보고 기본값을 정함) ─────────

export interface FaceTune {
  /** 눈마다 양 끝을 수평으로 맞추는 정도 0(얼굴 기울기만) ~ 1(눈마다 완전히 수평) */
  level: number;
  /** 눈꼬리 기울기(도). + 올라감, - 처짐 */
  tilt: number;
  /** 눈 사이 넓히기 (캐릭터 눈 자리 대비 배수) */
  spread: number;
  /** 눈 세로로 늘이기 (동그랗게) */
  round: number;
  /** 눈 크기 (캐릭터 두 눈 사이 거리 대비) */
  eyeSize: number;
  /** 입 크기 (두 눈 사이 거리 대비) */
  mouthSize: number;
  /** 입을 아래로 내리기 (두 눈 사이 거리 대비) */
  mouthDown: number;
  /** 양쪽 눈을 똑같이: 더 잘 보이는 눈 하나를 골라 반대쪽에 거울처럼 씀 (고개를 돌려도 두 눈이 같은 모양) */
  sameEyes: boolean;
}
/** 기본 실사 정도: 0 = 그림에 가깝게 (사용자 결정, 2026-11-04) */
export const FACE_LEVEL_DEFAULT = 0;

// 사용자가 휴대폰에서 직접 맞춘 값 (2026-11-02)
export const FACE_TUNE_DEFAULT: FaceTune = { level: 0.5, tilt: 4, spread: 1.07, round: 1.4, eyeSize: 0.47, mouthSize: 0.63, mouthDown: 0.2, sameEyes: true };
const TUNE_KEY = 'mallang-face-tune';
/** 지금 쓰는 값 (시안 화면에서 바꾸면 이 기기에만 기억) */
export const FACE_TUNE: FaceTune = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(TUNE_KEY) || 'null');
    if (v && typeof v === 'object') return { ...FACE_TUNE_DEFAULT, ...v };
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return { ...FACE_TUNE_DEFAULT };
})();
export function setFaceTune(v: Partial<FaceTune>) {
  Object.assign(FACE_TUNE, v);
  try {
    localStorage.setItem(TUNE_KEY, JSON.stringify(FACE_TUNE));
  } catch {
    /* 기억 못 해도 이번엔 적용 */
  }
}

// ───────── 인식 엔진 불러오기 (처음 한 번, 필요할 때만) ─────────

let landmarkerP: Promise<FaceLandmarker> | null = null;

/** 얼굴 인식 엔진 준비. 휴대폰 그래픽(GPU)이 안 되면 CPU로 */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerP) {
    landmarkerP = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks('/mediapipe');
      const make = (delegate: 'GPU' | 'CPU') =>
        FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        return await make('GPU');
      } catch {
        return await make('CPU');
      }
    })();
    landmarkerP.catch(() => (landmarkerP = null));
  }
  return landmarkerP;
}

// ───────── 얼굴 점 번호 (MediaPipe 478점) ─────────
// 사진 기준 왼쪽 눈(= 아이의 오른쪽 눈)이 A, 오른쪽이 B

const EYE_A = { outer: 33, inner: 133, ring: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], lid: [33, 246, 161, 160, 159, 158, 157, 173, 133] };
const EYE_B = { outer: 263, inner: 362, ring: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466], lid: [263, 466, 388, 387, 386, 385, 384, 398, 362] };
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const MOUTH_L = 61, MOUTH_R = 291;

// ───────── 떨림 거르기 (1€ 필터: 천천히 움직일 땐 많이, 빨리 움직일 땐 적게 거름) ─────────

class OneEuro {
  private x = NaN;
  private dx = 0;
  constructor(private minCut = 1.2, private beta = 0.02, private dCut = 1) {}
  private static a(cut: number, dt: number) {
    const r = 2 * Math.PI * cut * dt;
    return r / (r + 1);
  }
  filter(v: number, dt: number) {
    if (Number.isNaN(this.x) || dt <= 0) return (this.x = v);
    const d = (v - this.x) / dt;
    this.dx += OneEuro.a(this.dCut, dt) * (d - this.dx);
    const cut = this.minCut + this.beta * Math.abs(this.dx);
    this.x += OneEuro.a(cut, dt) * (v - this.x);
    return this.x;
  }
}

/** 얼굴 점 떨림 거르기 (화면 픽셀 단위) */
export class LandmarkSmoother {
  private fx: OneEuro[] = [];
  private fy: OneEuro[] = [];
  private last = -1;
  reset() {
    this.fx = [];
    this.fy = [];
    this.last = -1;
  }
  /** lm: 0~1 좌표, w·h: 영상 크기, t: 초 → 픽셀 좌표 */
  apply(lm: NormalizedLandmark[], w: number, h: number, t: number): Pt[] {
    const dt = this.last < 0 ? 0 : Math.min(0.2, t - this.last);
    this.last = t;
    return lm.map((p, i) => {
      if (!this.fx[i]) (this.fx[i] = new OneEuro(1.0, 0.004)), (this.fy[i] = new OneEuro(1.0, 0.004));
      return { x: this.fx[i].filter(p.x * w, dt), y: this.fy[i].filter(p.y * h, dt) };
    });
  }
}

type Pt = { x: number; y: number };

// ───────── 눈·입 오려 내기 ─────────

/** 오려 낸 눈 두 개(화면에서 왼쪽·오른쪽 순서)와 입. 같은 크기의 캔버스를 계속 다시 씀 */
export interface FacePatches {
  eyes: [HTMLCanvasElement, HTMLCanvasElement];
  mouth: HTMLCanvasElement;
}

/** 오린 조각의 가로·세로 크기 (눈: 실제 눈 너비의 EYE_CROP배를 담음) */
export const EYE_W = 144, EYE_H = 96, EYE_CROP = 2.2;
export const MOUTH_W = 176, MOUTH_H = 144, MOUTH_CROP = 1.95;

const mk = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** 실사 정도별로 조각 캔버스를 따로 둠 (시안 화면에서 세 단계를 나란히 보여주기 위해) */
const pool = new Map<string, FacePatches>();
/** 양쪽 눈을 똑같이 쓸 때 고른 눈 (화면 왼쪽 0 / 오른쪽 1) */
const domEye = new Map<string, number>();
function patchesFor(key: string): FacePatches {
  let p = pool.get(key);
  if (!p) pool.set(key, (p = { eyes: [mk(EYE_W, EYE_H), mk(EYE_W, EYE_H)], mouth: mk(MOUTH_W, MOUTH_H) }));
  return p;
}
// 가장자리를 부드럽게 만드는 작은 마스크 캔버스
const maskSmall = mk(36, 24);
const maskBig = mk(MOUTH_W, MOUTH_H);

export interface FaceStyleOpts {
  /** 실사 정도 0(그림에 가깝게) ~ 1(실제에 가깝게) */
  level: number;
  /** 거울처럼 좌우 뒤집기 (앞 카메라) */
  mirror: boolean;
  /** 그림 선 색 (눈꺼풀 선·어두운 곳) */
  ink?: string;
  /** 입술 색을 이 색 쪽으로 (캐릭터 입 색) */
  lip?: string;
  /** 눈·입 둘레 피부를 바꿀 캐릭터 얼굴 색 (사람 피부색이 드러나지 않게) */
  skinEye?: string;
  skinMouth?: string;
}

/**
 * 캐릭터 그림에서 눈 둘레·입 자리의 얼굴 색 뽑기 (그림마다 한 번). 볼터치를 피해 눈 위쪽을 봄.
 */
const skinCache = new WeakMap<Prepared, { eye?: string; mouth?: string }>();
export function artSkinColors(prep: Prepared): { eye?: string; mouth?: string } {
  const c0 = skinCache.get(prep);
  if (c0) return c0;
  const out: { eye?: string; mouth?: string } = {};
  try {
    const W = prep.img.width, H = prep.img.height;
    const g = prep.img.getContext('2d', { willReadFrequently: true })!;
    const at = (x: number, y: number): [number, number, number, number] => {
      const d = g.getImageData(Math.max(0, Math.min(W - 1, Math.round(x * W))), Math.max(0, Math.min(H - 1, Math.round(y * H))), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const median = (ps: [number, number, number, number][]) => {
      const ok = ps.filter((p) => p[3] > 200);
      if (!ok.length) return undefined;
      const m = (i: number) => ok.map((p) => p[i]).sort((a, b) => a - b)[Math.floor(ok.length / 2)];
      return '#' + [m(0), m(1), m(2)].map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    const eyes = prep.rig?.eyes ?? [];
    if (eyes.length) {
      const ps: [number, number, number, number][] = [];
      for (const e of eyes) for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) ps.push(at(e.cx + Math.sin(a * Math.PI) * e.rx * 3, e.cy - Math.cos(a * Math.PI) * e.ry * 3));
      out.eye = median(ps);
    }
    const mt = prep.mouth;
    if (mt) {
      const ps: [number, number, number, number][] = [];
      for (const dx of [-0.4, -0.2, 0, 0.2, 0.4]) for (const dy of [-0.15, 0, 0.15]) ps.push(at(mt.x + dx * mt.w, mt.y + dy * mt.w));
      out.mouth = median(ps);
    }
  } catch {
    /* 그림을 못 읽으면 원래 색 그대로 */
  }
  skinCache.set(prep, out);
  return out;
}

/**
 * 영상(또는 사진) 한 장과 얼굴 점(픽셀 좌표)으로 눈·입 조각을 만듦.
 * 반환된 캔버스는 다음 호출 때 다시 쓰이니, 바로 그리고 버리세요(또는 복사).
 */
export function extractPatches(src: CanvasImageSource, pts: Pt[], o: FaceStyleOpts, key = 'main'): FacePatches {
  const P = patchesFor(key);
  const pa = pts[EYE_A.outer], pb = pts[EYE_B.outer];
  // 얼굴 기울기 (두 눈 바깥 끝을 이은 선)
  const roll = Math.atan2(pb.y - pa.y, pb.x - pa.x);
  const ink = o.ink ?? '#3A3350';
  const L = Math.max(0, Math.min(1, o.level));

  const eyeOf = (E: typeof EYE_A, c: HTMLCanvasElement) => {
    const a = pts[E.outer], b = pts[E.inner];
    const w = Math.hypot(b.x - a.x, b.y - a.y);
    const cen = centroid(E.ring.map((i) => pts[i]));
    // 눈마다 양 끝을 수평으로 (눈꼬리가 올라간 '째진 눈'처럼 보이지 않게)
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const eyeRoll = roll + (Math.atan2(r.y - l.y, r.x - l.x) - roll) * FACE_TUNE.level;
    cutOut(c, src, cen, eyeRoll, (w * EYE_CROP) / EYE_W, o.mirror, E.ring.map((i) => pts[i]), [1.5, 1.8, 2.3], E.lid.map((i) => pts[i]), false, [1.1, 1.3, 1.25], true);
    stylize(c, L, { ink, dark: ink, lip: null, skin: o.skinEye ?? null, mouth: false });
  };
  // 거울 모드면 사진 오른쪽 눈(B)이 화면 왼쪽으로
  const [left, right] = o.mirror ? [EYE_B, EYE_A] : [EYE_A, EYE_B];
  if (FACE_TUNE.sameEyes) {
    // 더 크게(카메라에 가깝게) 보이는 눈 하나를 골라 양쪽에 씀. 자주 바뀌어 깜빡이지 않게, 다른 눈이 12% 넘게 커야 바꿈
    const wOf = (E: typeof EYE_A) => Math.hypot(pts[E.inner].x - pts[E.outer].x, pts[E.inner].y - pts[E.outer].y);
    const wl = wOf(left), wr = wOf(right);
    let pick = domEye.get(key) ?? (wl >= wr ? 0 : 1);
    if (pick === 0 && wr > wl * 1.12) pick = 1;
    else if (pick === 1 && wl > wr * 1.12) pick = 0;
    domEye.set(key, pick);
    const [src, dst] = pick === 0 ? [P.eyes[0], P.eyes[1]] : [P.eyes[1], P.eyes[0]];
    eyeOf(pick === 0 ? left : right, src);
    // 반대쪽은 좌우를 뒤집어 그대로
    const g = dst.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, dst.width, dst.height);
    g.setTransform(-1, 0, 0, 1, dst.width, 0);
    g.drawImage(src, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    eyeOf(left, P.eyes[0]);
    eyeOf(right, P.eyes[1]);
  }

  const ml = pts[MOUTH_L], mr = pts[MOUTH_R];
  const mw = Math.hypot(mr.x - ml.x, mr.y - ml.y);
  const lips = LIPS_OUTER.map((i) => pts[i]);
  cutOut(P.mouth, src, centroid(lips), roll, (mw * MOUTH_CROP) / MOUTH_W, o.mirror, lips, [1.32, 1.6, 1.6], lips, true, [1.14, 1.25, 1.25]);
  const lip = o.lip ?? '#C9606E';
  stylize(P.mouth, L, { ink, dark: mixHex(lip, ink, 0.45), lip, skin: o.skinMouth ?? null, mouth: true });
  return P;
}

function centroid(ps: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of ps) (x += p.x), (y += p.y);
  return { x: x / ps.length, y: y / ps.length };
}

/**
 * c에 src의 cen 주변을 기울기 roll만큼 바로 세워 오려 담고, ring 다각형 바깥은 부드럽게 지움.
 * scale: 조각 1픽셀 = 원본 몇 픽셀. grow: 다각형을 [가로, 위쪽, 아래쪽]으로 키우는 비율. line: 그림 선을 그릴 점들
 */
function cutOut(c: HTMLCanvasElement, src: CanvasImageSource, cen: Pt, roll: number, scale: number, mirror: boolean, ring: Pt[], grow: [number, number, number], line: Pt[], closed = false, coreGrow: [number, number, number] = [1, 1, 1], round = false) {
  const W = c.width, H = c.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, W, H);
  // 원본 → 조각 좌표
  const cos = Math.cos(-roll), sin = Math.sin(-roll);
  const toPatch = (p: Pt): Pt => {
    const dx = p.x - cen.x, dy = p.y - cen.y;
    let u = (dx * cos - dy * sin) / scale + W / 2;
    const v = (dx * sin + dy * cos) / scale + H / 2;
    if (mirror) u = W - u;
    return { x: u, y: v };
  };
  g.save();
  if (mirror) {
    g.translate(W, 0);
    g.scale(-1, 1);
  }
  g.translate(W / 2, H / 2);
  g.scale(1 / scale, 1 / scale);
  g.rotate(-roll);
  g.translate(-cen.x, -cen.y);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0);
  g.restore();

  // 부드러운 마스크: 작은 캔버스에 다각형을 그린 뒤 크게 늘이면 가장자리가 자연스럽게 흐려짐
  const poly = ring.map(toPatch);
  const pc = centroid(poly);
  // [가로, 위쪽, 아래쪽] 비율로 키움 (눈은 위쪽을 덜 키워 눈썹이 들어오지 않게)
  const growPt = (p: Pt, g: [number, number, number]) => ({ x: pc.x + (p.x - pc.x) * g[0], y: pc.y + (p.y - pc.y) * (p.y < pc.y ? g[1] : g[2]) });
  const gp = poly.map((p) => growPt(p, grow));
  const ms = maskSmall.getContext('2d')!;
  const kx = maskSmall.width / W, ky = maskSmall.height / H;
  ms.setTransform(1, 0, 0, 1, 0, 0);
  ms.clearRect(0, 0, maskSmall.width, maskSmall.height);
  ms.fillStyle = '#000';
  ms.beginPath();
  if (round) {
    // 눈: 동그란(타원) 모양으로 오려 귀엽게
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of gp) (x0 = Math.min(x0, p.x)), (x1 = Math.max(x1, p.x)), (y0 = Math.min(y0, p.y)), (y1 = Math.max(y1, p.y));
    const rx = Math.min(W / 2 - 1, (x1 - x0) / 2);
    const ry = Math.min(H / 2 - 1, Math.max((y1 - y0) / 2, rx * 0.62));
    ms.ellipse(((x0 + x1) / 2) * kx, ((y0 + y1) / 2) * ky, rx * kx, ry * ky, 0, 0, Math.PI * 2);
  } else gp.forEach((p, i) => (i ? ms.lineTo(p.x * kx, p.y * ky) : ms.moveTo(p.x * kx, p.y * ky)));
  ms.closePath();
  ms.fill();
  const mb = maskBig.getContext('2d')!;
  mb.setTransform(1, 0, 0, 1, 0, 0);
  mb.clearRect(0, 0, maskBig.width, maskBig.height);
  mb.imageSmoothingEnabled = true;
  mb.imageSmoothingQuality = 'high';
  mb.drawImage(maskSmall, 0, 0, W, H);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(maskBig, 0, 0, W, H, 0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  // 안쪽(눈·입술 자체) 표시: 키우지 않은 다각형 → 그 밖은 피부로 보고 캐릭터 색으로 바꿈
  ms.clearRect(0, 0, maskSmall.width, maskSmall.height);
  ms.beginPath();
  const cp = poly.map((p) => growPt(p, coreGrow));
  cp.forEach((p, i) => (i ? ms.lineTo(p.x * kx, p.y * ky) : ms.moveTo(p.x * kx, p.y * ky)));
  ms.closePath();
  ms.fill();
  mb.clearRect(0, 0, maskBig.width, maskBig.height);
  mb.drawImage(maskSmall, 0, 0, W, H);
  const core = mb.getImageData(0, 0, W, H).data;
  const coreA = new Uint8Array(W * H);
  for (let i = 0; i < coreA.length; i++) coreA[i] = core[i * 4 + 3];
  coreCache.set(c, coreA);
  // 그림 선을 그릴 점 (조각 좌표로) 기억
  lineCache.set(c, { pts: line.map(toPatch), closed });
}

const coreCache = new WeakMap<HTMLCanvasElement, Uint8Array>();
function mixHex(a: string, b: string, t: number) {
  const x = hex(a), y = hex(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const lineCache = new WeakMap<HTMLCanvasElement, { pts: Pt[]; closed: boolean }>();

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const sstep = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const PAPER: [number, number, number] = [253, 248, 238];

/**
 * 그림체로 바꾸기: 둘레 피부 → 캐릭터 얼굴 색, 채도 낮추기, 흰자·이 → 종이색, 어두운 곳 → 그림 선 색(입속은 따뜻한 어두운 색),
 * 입술 → 캐릭터 입 색, 종이 질감, 그림 선
 */
function stylize(c: HTMLCanvasElement, L: number, o: { ink: string; dark: string; lip: string | null; skin: string | null; mouth: boolean }) {
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const W = c.width, H = c.height;
  const k = 1 - L; // 그림 쪽으로 바꾸는 정도
  const id = g.getImageData(0, 0, W, H);
  const d = id.data;
  const core = coreCache.get(c);
  const lc = o.lip ? hex(o.lip) : null;
  const sk = o.skin ? hex(o.skin) : null;
  // 둘레 피부의 평균 밝기 (그늘을 살리며 캐릭터 색으로 바꾸기 위해)
  let ys = 0, yn = 0;
  if (sk && core) {
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      if (d[i + 3] < 40 || core[p] > 60) continue;
      ys += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      yn++;
    }
  }
  const yAvg = yn ? ys / yn : 180;
  const sat = 0.45 + 0.55 * L;
  // 피부를 캐릭터 색으로 바꾸는 정도: 실제에 가까워도 사람 피부색은 대부분 덮음
  const skinK = 0.88 + 0.12 * k;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] === 0) continue;
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    const y = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const s = mx ? (mx - mn) / mx : 0;
    // 1) 둘레 피부 → 캐릭터 얼굴 색 (밝기 차이는 조금 남겨 눈두덩·입가 그늘이 보이게)
    if (sk && core) {
      const out = 1 - core[p] / 255;
      if (out > 0) {
        const shade = Math.max(0.9, Math.min(1.08, 1 + ((y * 255 - yAvg) / 255) * 0.6));
        const t = out * skinK;
        r += (sk[0] * shade - r) * t;
        gg += (sk[1] * shade - gg) * t;
        b += (sk[2] * shade - b) * t;
      }
    }
    if (k > 0.01) {
      // 2) 채도 낮추기 (입술은 색을 덜 빼서 생기 있게)
      const yy = (0.299 * r + 0.587 * gg + 0.114 * b);
      const inCore = core ? core[p] / 255 : 0;
      // 색 빼기는 눈 안쪽에만 (캐릭터 색으로 바꾼 둘레 피부·입술은 그대로)
      const sat2 = o.mouth ? 1 : 1 - (1 - sat) * inCore;
      r = yy + (r - yy) * sat2;
      gg = yy + (gg - yy) * sat2;
      b = yy + (b - yy) * sat2;
      // 3) 밝고 색이 옅은 곳(흰자·이) → 종이색 (입속 이는 덜 눈부시게)
      // (눈·입 안쪽만 — 둘레 피부가 하얗게 뜨지 않게)
      const wv = k * (o.mouth ? 0.12 : 0.8) * sstep(0.5, 0.78, y) * (1 - sstep(0.25, 0.55, s)) * (core ? inCore : 1);
      const pw = o.mouth ? 0.93 : 1;
      r += (PAPER[0] * pw - r) * wv;
      gg += (PAPER[1] * pw - gg) * wv;
      b += (PAPER[2] * pw - b) * wv;
      // 4) 어두운 곳(눈동자·속눈썹·입속)은 칠하지 않음 — 실제 눈·입 그대로
      // 5) 붉은 곳(입술) → 캐릭터 입 색 쪽으로
      if (lc) {
        const red = sstep(0.08, 0.3, s) * sstep(0.02, 0.12, (d[i] - d[i + 2]) / 255) * (1 - sstep(0.7, 0.9, y)) * (core ? core[p] / 255 : 1);
        const lv = 0.15 * k * red;
        r += (lc[0] - r) * lv;
        gg += (lc[1] - gg) * lv;
        b += (lc[2] - b) * lv;
      }
      // 6) 그림처럼 단계 나누기 (그림에 가까울수록)
      if (k > 0.5 && inCore < 0.5) {
        const q = 255 / 6;
        const m = (k - 0.5) * 0.8;
        r += (Math.round(r / q) * q - r) * m;
        gg += (Math.round(gg / q) * q - gg) * m;
        b += (Math.round(b / q) * q - b) * m;
      }
    }
    d[i] = r;
    d[i + 1] = gg;
    d[i + 2] = b;
  }
  g.putImageData(id, 0, 0);
  // 수채화 종이 질감 (그림과 같은 질감)
  if (k > 0.01) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.28 * k;
    const pat = g.createPattern(paperGrain(), 'repeat');
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
    }
    g.restore();
  }
  // 그림 선 (눈: 윗눈꺼풀, 입: 입술 둘레) — 그림에 가까울수록 진하게
  const ln = lineCache.get(c);
  // 그린 선(눈꺼풀·입술 선)은 넣지 않음 — 속눈썹·아이라인처럼 보여 실제 눈이 덜 자연스러움
}
