import { BUILTIN_MAP, type MouthMeta } from './builtins';
import type { ImgTransform, Picture, PictureSnapshot } from './types';

export interface PreparedPart {
  img: HTMLCanvasElement;
  /** 본 그림 크기 대비 0~1 좌표 */
  cx: number;
  cy: number;
  r: number;
}

export interface Prepared {
  img: HTMLCanvasElement;
  w: number;
  h: number;
  parts: PreparedPart[];
  builtin: boolean;
  /** 기본 그림의 입 자리 (그림에서 입을 지워 두었음) */
  mouth?: MouthMeta;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('그림을 열 수 없어요'));
    img.src = src;
  });
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    return img;
  } finally {
    // 그린 뒤에 해제 (img는 이미 디코딩됨)
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

let grain: HTMLCanvasElement | null = null;
/** 종이 결 텍스처 (한 번만 생성) */
export function paperGrain(): HTMLCanvasElement {
  if (grain) return grain;
  const s = 256;
  const c = makeCanvas(s, s);
  const g = c.getContext('2d')!;
  const id = g.createImageData(s, s);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < s * s; i++) {
    const v = rnd();
    const light = v > 0.5;
    id.data[i * 4] = light ? 255 : 60;
    id.data[i * 4 + 1] = light ? 250 : 45;
    id.data[i * 4 + 2] = light ? 240 : 30;
    id.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 70);
  }
  g.putImageData(id, 0, 0);
  // 섬유결
  g.globalAlpha = 0.08;
  g.strokeStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = 0.6 + rnd();
    g.beginPath();
    const x = rnd() * s, y = rnd() * s;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + rnd() * 30 - 15, y + rnd() * 30 - 15, x + rnd() * 50 - 25, y + rnd() * 50 - 25);
    g.stroke();
  }
  grain = c;
  return c;
}

function applyGrain(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 0.55;
  g.fillStyle = g.createPattern(paperGrain(), 'repeat')!;
  g.fillRect(0, 0, c.width, c.height);
  g.restore();
}

const MAX_SIDE = 1400;

async function rasterBlob(blob: Blob) {
  const img = await blobToImage(blob);
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const s = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const c = makeCanvas(w0 * s, h0 * s);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const cache = new Map<string, Promise<Prepared>>();
const blobCache = new WeakMap<Blob, Promise<Prepared>>();

/** 원본 그림을 그대로 사용 (재생성·얼굴 합성 없음). 기본 그림만 종이 질감을 입힘. */
export function prepare(src: { id: string; builtinKey?: string; image?: Blob; updatedAt?: number }): Promise<Prepared> {
  if (src.image) {
    let bp = blobCache.get(src.image);
    if (!bp) {
      bp = rasterBlob(src.image).then((img) => ({ img, w: img.width, h: img.height, parts: [], builtin: false }));
      blobCache.set(src.image, bp);
    }
    return bp;
  }
  const key = 'b:' + (src.builtinKey ?? '');
  let p = cache.get(key);
  if (!p) {
    p = (async (): Promise<Prepared> => {
      if (src.image) {
        const img = await rasterBlob(src.image);
        return { img, w: img.width, h: img.height, parts: [], builtin: false };
      }
      const def = src.builtinKey ? BUILTIN_MAP[src.builtinKey] : undefined;
      if (!def) {
        const c = makeCanvas(10, 10);
        return { img: c, w: 10, h: 10, parts: [], builtin: true };
      }
      const im = await loadImage(def.src);
      const c = makeCanvas(im.naturalWidth, im.naturalHeight);
      c.getContext('2d')!.drawImage(im, 0, 0);
      return { img: c, w: c.width, h: c.height, parts: [], builtin: true, mouth: def.mouth };
    })();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export function prepareSnapshot(s: PictureSnapshot, clipId: string) {
  return prepare({ id: 'snap-' + clipId, builtinKey: s.builtinKey, image: s.image });
}

export function snapshotOf(p: Picture): PictureSnapshot {
  return { name: p.name, builtinKey: p.image ? undefined : p.builtinKey, image: p.image, transform: { ...p.transform } };
}

/** 썸네일용 URL */
export function thumbUrl(p: { builtinKey?: string; image?: Blob }): { url: string; revoke: boolean } {
  if (p.image) return { url: URL.createObjectURL(p.image), revoke: true };
  const def = p.builtinKey ? BUILTIN_MAP[p.builtinKey] : undefined;
  return { url: def ? def.src : '', revoke: false };
}

export function transformStyle(t: ImgTransform): string {
  return `translate(${t.x * 100}%, ${t.y * 100}%) scale(${t.scale})`;
}

/**
 * 업로드한 파일 정리: 너무 크면 줄이고, 투명 배경은 유지(PNG/WebP)
 */
export async function normalizeUpload(file: Blob): Promise<Blob> {
  const ok = /image\/(png|jpe?g|webp|gif|heic|heif|avif)/i.test(file.type) || file.type === '';
  if (!ok) throw new Error('PNG, JPG, WebP 그림만 올릴 수 있어요');
  const img = await blobToImage(file).catch(() => {
    throw new Error('이 그림 파일은 열 수 없어요. PNG, JPG, WebP로 저장해서 다시 올려주세요');
  });
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const needsResize = Math.max(w0, h0) > 2048;
  const browserFriendly = /image\/(png|jpe?g|webp)/i.test(file.type);
  if (!needsResize && browserFriendly) return file;
  const s = Math.min(1, 2048 / Math.max(w0, h0));
  const c = makeCanvas(w0 * s, h0 * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const type = /jpe?g/i.test(file.type) ? 'image/jpeg' : 'image/png';
  return canvasToBlob(c, type, 0.92);
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('이미지를 만들 수 없어요'))), type, q));
}

/**
 * 단색 배경 지우기: 가장자리에서 시작해 비슷한 색을 투명하게 만듭니다.
 * 원본은 따로 보관되므로 언제든 되돌릴 수 있습니다.
 */
export async function removeSolidBackground(blob: Blob, tolerance: number): Promise<HTMLCanvasElement> {
  const src = await rasterBlob(blob);
  const w = src.width, h = src.height;
  const g = src.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  // 가장자리 색 평균 (네 모서리 근처)
  const samples: number[][] = [];
  const pick = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (d[i + 3] > 10) samples.push([d[i], d[i + 1], d[i + 2]]);
  };
  for (let i = 0; i < 20; i++) {
    const tx = Math.floor((i / 19) * (w - 1));
    const ty = Math.floor((i / 19) * (h - 1));
    pick(tx, 0); pick(tx, h - 1); pick(0, ty); pick(w - 1, ty);
  }
  if (!samples.length) return src;
  const bg = [0, 1, 2].map((k) => samples.reduce((s, c) => s + c[k], 0) / samples.length);
  const tol = tolerance * 1.6 + 10; // 0~100 → 거리
  const dist = (i: number) => {
    const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7;
  };
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (d[i + 3] < 10 || dist(i) <= tol) stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  const removed = new Uint8Array(w * h);
  while (stack.length) {
    const p = stack.pop()!;
    removed[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let p = 0; p < w * h; p++) {
    if (removed[p]) d[p * 4 + 3] = 0;
    else {
      // 경계 부드럽게
      const x = p % w, y = (p / w) | 0;
      let n = 0;
      if (x > 0 && removed[p - 1]) n++;
      if (x < w - 1 && removed[p + 1]) n++;
      if (y > 0 && removed[p - w]) n++;
      if (y < h - 1 && removed[p + w]) n++;
      if (n) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * (1 - n * 0.15));
    }
  }
  g.putImageData(id, 0, 0);
  return src;
}
