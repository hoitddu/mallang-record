import { concatBuffers } from './audio';
import type { MotionFrame, MotionTrack } from './motion';
import { advanceFrame, frameAt } from './motion';
import { captionTimes, captionShown } from './captionTiming';
import type { FacePlayer } from './faceTrack';
import type { FaceDraw, SceneInfo } from './render';

export interface TimelineItem {
  scene: SceneInfo;
  track: MotionTrack;
  buf: AudioBuffer;
  trimStart: number;
  trimEnd: number;
  /** 아이 눈·입 조각 (녹화한 기록만) */
  face?: FacePlayer | null;
}

/** 기록 i의 눈·입: 재생 중이면 그 시각, 아니면 말을 시작한 때(눈 뜨고 있는 장면) */
export function itemFace(it: TimelineItem, local?: number): FaceDraw | null {
  if (!it.face) return null;
  const rest = it.track.firstVoice >= 0 ? it.track.firstVoice : it.trimStart;
  const t = local === undefined ? rest : Math.max(it.trimStart, Math.min(it.trimEnd, local));
  return it.face.at(t);
}

export interface Timeline {
  items: TimelineItem[];
  /** 각 클립의 소리가 시작하는 시각 (초) */
  offsets: number[];
  total: number;
  gap: number;
  /**
   * 장면을 직접 그리는 방식 (예: 그림책). 있으면 미리보기·영상 모두 이걸로 그림.
   * idleNow가 있으면 "재생 전 멈춘 화면" (첫 장면, 움직임은 쉬는 상태)
   */
  draw?: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number, idleNow?: number) => void;
}

export function buildTimeline(items: TimelineItem[], lead = 0.5, gap = 0.8, tail = 1.0): Timeline {
  const offsets: number[] = [];
  let t = lead;
  items.forEach((it, i) => {
    offsets.push(t);
    t += Math.max(0.05, it.trimEnd - it.trimStart);
    if (i < items.length - 1) t += gap;
  });
  return { items, offsets, total: t + tail, gap };
}

export function timelineAudio(tl: Timeline): AudioBuffer {
  return concatBuffers(
    tl.items.map((it, i) => ({ buf: it.buf, start: it.trimStart, end: it.trimEnd, at: tl.offsets[i] })),
    tl.total
  );
}

/** 한 기록의 움직임: 소리가 o초에 시작할 때, 시각 t의 움직임 (자르기 범위 밖은 쉬는 상태로) */
export function itemFrame(it: TimelineItem, o: number, t: number): MotionFrame {
  const local = it.trimStart + (t - o);
  const end = it.trimEnd;
  if (local < it.trimStart) return { ...frameAt(null, 0), t: local };
  if (local > end) return advanceFrame(frameAt(it.track, end), local - end, local);
  return frameAt(it.track, local);
}

const capCache = new WeakMap<TimelineItem, { text: string; times: number[] | null }>();
/**
 * 기록 하나의 자막 글자별 나타나는 시각 (녹음 기준 초). 자르기 범위 안의 목소리만 보고,
 * 말하는 박자·쉬는 틈에 맞춰 글자·단어를 배치 (captionTiming.ts)
 */
export function itemCaptionTimes(it: TimelineItem, text: string): number[] | null {
  const c = capCache.get(it);
  if (c && c.text === text) return c.times;
  const tr = it.track;
  const end = it.trimEnd;
  let times: number[] | null = null;
  if (tr.firstVoice >= 0 && tr.firstVoice <= end && tr.lastVoice >= it.trimStart) {
    const first = Math.max(tr.firstVoice, it.trimStart);
    const last = Math.min(tr.lastVoice, end);
    const ons = (tr.syllables ?? []).filter((s) => s >= it.trimStart - 0.05 && s <= end);
    times = captionTimes(text, ons.length ? ons : [first], first, last);
  } else {
    // 목소리를 못 찾은 기록: 시작하고 조금 뒤부터 천천히
    const n = Math.max(1, Array.from(text).length);
    times = Array.from(text, (_, i) => it.trimStart + 0.15 + (i * Math.min(1.2, 0.18 * n)) / n);
  }
  capCache.set(it, { text, times });
  return times;
}

/** 시각 t에 보여줄 장면과 움직임 */
export function sceneAt(tl: Timeline, t: number): { scene: SceneInfo; frame: MotionFrame } {
  const n = tl.items.length;
  let i = 0;
  while (i < n - 1 && t >= tl.offsets[i + 1] - tl.gap / 2) i++;
  const it = tl.items[i];
  const o = tl.offsets[i];
  const end = it.trimEnd;
  const frame = itemFrame(it, o, t);

  // 자막: 아이가 말하는 박자에 맞춰 글자·단어가 나타남 (자르기 범위 안의 목소리 기준)
  const captionT = it.trimStart + (t - o);
  const captionTimes = itemCaptionTimes(it, it.scene.caption?.text ?? '');
  const captionReveal = captionShown(captionT, captionTimes);
  const winStart = i === 0 ? 0 : o - tl.gap / 2;
  const alpha = i === 0 ? 1 : Math.min(1, (t - winStart) / 0.25);
  return { scene: { ...it.scene, captionReveal, captionTimes, captionT, alpha, face: itemFace(it, captionT) }, frame };
}
