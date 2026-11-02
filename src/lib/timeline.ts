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

/** 시각 t에 보여줄 장면과 움직임 */
export function sceneAt(tl: Timeline, t: number): { scene: SceneInfo; frame: MotionFrame } {
  const n = tl.items.length;
  let i = 0;
  while (i < n - 1 && t >= tl.offsets[i + 1] - tl.gap / 2) i++;
  const it = tl.items[i];
  const o = tl.offsets[i];
  const local = it.trimStart + (t - o);
  const end = it.trimEnd;
  // 자르기 범위 밖의 소리는 움직임에도 쓰지 않음
  let frame: MotionFrame;
  if (local < it.trimStart) frame = { ...frameAt(null, 0), t: local };
  else if (local > end) {
    const f = frameAt(it.track, end);
    const over = local - end;
    const d = Math.exp(-over / 0.15);
    frame = { ...f, lvl: f.lvl * d, spring: f.spring * d, pulse: f.pulse * d, speak: f.speak * d, t: local };
  } else frame = frameAt(it.track, local);

  const fv = it.track.firstVoice >= it.trimStart && it.track.firstVoice <= end ? it.track.firstVoice : it.trimStart + 0.15;
  const revealAt = o + (fv - it.trimStart);
  const captionReveal = Math.max(0, Math.min(1, (t - revealAt) / 0.45));
  const winStart = i === 0 ? 0 : o - tl.gap / 2;
  const alpha = i === 0 ? 1 : Math.min(1, (t - winStart) / 0.25);
  return { scene: { ...it.scene, captionReveal, alpha }, frame };
}
