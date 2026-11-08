/**
 * 녹화한 아이 눈·입 조각을 저장하고(FaceRecorder) 다시 보여 주는 곳(FacePlayer).
 *
 * - 원본 카메라 영상은 녹화하지 않아요. 프레임마다 그림체로 바꾼 눈·입 조각만 작은 그림판에 모아 저장해요.
 * - 초당 15장면만 담고, 보여 줄 때는 앞뒤 장면을 부드럽게 섞어 끊김 없이 보여요.
 * - 미리보기·영상 만들기·그림책이 모두 같은 기록에서 같은 시각의 조각을 꺼내 써서 결과가 똑같아요.
 */
import { EYE_H, EYE_W, MOUTH_H, MOUTH_W, type FacePatches } from './face';
import type { FaceDraw } from './render';
import type { FaceRecord } from './types';

export const FACE_FPS = 15;
const COLS = 4;
const ROWS = 8;
const CELL_W = EYE_W * 2 + MOUTH_W;
const CELL_H = Math.max(EYE_H, MOUTH_H);

const mk = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('조각 저장 실패'))), 'image/webp', 0.86)
  );
}

/** 녹화 중 눈·입 조각 모으기 */
export class FaceRecorder {
  private sheet: HTMLCanvasElement | null = null;
  private used = 0;
  private pending: Promise<Blob>[] = [];
  private times: number[] = [];
  private cells: number[] = [];
  private ratios: number[] = [];
  private nCells = 0;
  constructor(private level: number) {}

  /** t: 녹음 시작부터 초, p: 이번 장면의 조각(얼굴을 못 찾았으면 null) */
  add(t: number, p: FacePatches | null) {
    const last = this.times[this.times.length - 1];
    if (last !== undefined && t - last < 1 / FACE_FPS - 0.004) return;
    this.times.push(t);
    if (!p) {
      this.cells.push(-1);
      this.ratios.push(0, 0);
      return;
    }
    this.ratios.push(+(p.ratio?.eye ?? 0).toFixed(3), +(p.ratio?.mouth ?? 0).toFixed(3));
    if (!this.sheet) {
      this.sheet = mk(CELL_W * COLS, CELL_H * ROWS);
      this.used = 0;
    }
    const g = this.sheet.getContext('2d')!;
    const x = (this.used % COLS) * CELL_W, y = Math.floor(this.used / COLS) * CELL_H;
    g.drawImage(p.eyes[0], x, y);
    g.drawImage(p.eyes[1], x + EYE_W, y);
    g.drawImage(p.mouth, x + EYE_W * 2, y);
    this.cells.push(this.nCells++);
    this.used++;
    // 한 장이 차면 바로 압축해 두고 그림판은 버림 (메모리 아끼기)
    if (this.used >= COLS * ROWS) this.flush();
  }

  private flush() {
    if (!this.sheet || !this.used) return;
    this.pending.push(toBlob(this.sheet));
    this.sheet = null;
    this.used = 0;
  }

  /** 얼굴을 한 번이라도 찾았는지 */
  get found() {
    return this.nCells > 0;
  }

  async finish(): Promise<FaceRecord | null> {
    this.flush();
    if (!this.nCells) return null;
    const sheets = await Promise.all(this.pending);
    return { v: 1, level: this.level, cellW: CELL_W, cellH: CELL_H, cols: COLS, rows: ROWS, times: this.times, cells: this.cells, ratios: this.ratios, sheets };
  }
}

/** 저장된 눈·입 조각을 시각에 맞춰 꺼내기 */
export class FacePlayer {
  private out: FacePatches = { eyes: [mk(EYE_W, EYE_H), mk(EYE_W, EYE_H)], mouth: mk(MOUTH_W, MOUTH_H) };
  private lastKey = '';
  private constructor(private rec: FaceRecord, private bitmaps: ImageBitmap[]) {}

  static async load(rec: FaceRecord): Promise<FacePlayer> {
    const bitmaps = await Promise.all(rec.sheets.map((b) => createImageBitmap(b)));
    return new FacePlayer(rec, bitmaps);
  }

  /** 녹음 기준 시각 t의 눈·입 (얼굴이 안 보이던 때는 presence가 0 쪽으로) */
  at(t: number): FaceDraw | null {
    const { times, cells } = this.rec;
    const n = times.length;
    if (!n) return null;
    // t가 들어가는 장면 i (times[i] <= t < times[i+1])
    let lo = 0, hi = n - 1;
    if (t <= times[0]) hi = 0;
    else if (t >= times[n - 1]) lo = n - 1;
    else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) lo = mid;
        else hi = mid;
      }
    }
    const i = t <= times[0] ? 0 : lo;
    const j = Math.min(n - 1, i + 1);
    const a = j > i ? Math.max(0, Math.min(1, (t - times[i]) / (times[j] - times[i]))) : 0;
    const ci = cells[i], cj = cells[j];
    const presence = (ci >= 0 ? 1 - a : 0) + (cj >= 0 ? a : 0);
    if (presence <= 0.001) return null;
    const key = `${i}:${j}:${Math.round(a * 20)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.blit(ci, cj, a);
    }
    // 실제 비율 (얼굴을 찾은 장면끼리 섞음)
    const R = this.rec.ratios;
    if (R) {
      const ri = ci >= 0 ? i : j, rj = cj >= 0 ? j : i;
      const w = ci >= 0 && cj >= 0 ? a : 0;
      const eye = R[ri * 2] + (R[rj * 2] - R[ri * 2]) * w, mouth = R[ri * 2 + 1] + (R[rj * 2 + 1] - R[ri * 2 + 1]) * w;
      this.out.ratio = eye > 0 && mouth > 0 ? { eye, mouth } : undefined;
    } else this.out.ratio = undefined;
    return { patches: this.out, presence };
  }

  /** 두 장면의 조각을 섞어 출력 캔버스에 그림 */
  private blit(ci: number, cj: number, a: number) {
    const parts: [HTMLCanvasElement, number, number, number][] = [
      [this.out.eyes[0], 0, EYE_W, EYE_H],
      [this.out.eyes[1], EYE_W, EYE_W, EYE_H],
      [this.out.mouth, EYE_W * 2, MOUTH_W, MOUTH_H],
    ];
    for (const [c, ox, w, h] of parts) {
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, w, h);
      const draw = (cell: number, alpha: number) => {
        if (cell < 0 || alpha <= 0) return;
        const per = this.rec.cols * this.rec.rows;
        const bm = this.bitmaps[Math.floor(cell / per)];
        if (!bm) return;
        const k = cell % per;
        const x = (k % this.rec.cols) * this.rec.cellW + ox, y = Math.floor(k / this.rec.cols) * this.rec.cellH;
        g.globalAlpha = alpha;
        g.drawImage(bm, x, y, w, h, 0, 0, w, h);
      };
      // 앞 장면을 그리고 뒤 장면을 비율만큼 겹침 (한쪽만 있으면 그것만)
      if (ci >= 0) draw(ci, 1);
      if (cj >= 0 && cj !== ci) draw(cj, ci >= 0 ? a : 1);
      g.globalAlpha = 1;
    }
  }
}

/** 기록마다 한 번만 불러오기 */
const cache = new WeakMap<FaceRecord, Promise<FacePlayer>>();
export function facePlayerOf(rec: FaceRecord): Promise<FacePlayer> {
  let p = cache.get(rec);
  if (!p) {
    p = FacePlayer.load(rec);
    cache.set(rec, p);
    p.catch(() => cache.delete(rec));
  }
  return p;
}
