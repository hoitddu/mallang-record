import { concatBuffers } from './audio';
import type { MotionFrame, MotionTrack } from './motion';
import { frameAt } from './motion';
import type { SceneInfo } from './render';

export interface TimelineItem {
  scene: SceneInfo;
  track: MotionTrack;
  buf: AudioBuffer;
  trimStart: number;
  trimEnd: number;
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
  if (local > end) {
    const f = frameAt(it.track, end);
    const d = Math.exp(-(local - end) / 0.15);
    return { ...f, lvl: f.lvl * d, spring: f.spring * d, pulse: f.pulse * d, speak: f.speak * d, t: local };
  }
  return frameAt(it.track, local);
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

  const fv = it.track.firstVoice >= it.trimStart && it.track.firstVoice <= end ? it.track.firstVoice : it.trimStart + 0.15;
  const revealAt = o + (fv - it.trimStart);
  const captionReveal = Math.max(0, Math.min(1, (t - revealAt) / 0.45));
  const winStart = i === 0 ? 0 : o - tl.gap / 2;
  const alpha = i === 0 ? 1 : Math.min(1, (t - winStart) / 0.25);
  return { scene: { ...it.scene, captionReveal, alpha }, frame };
}
