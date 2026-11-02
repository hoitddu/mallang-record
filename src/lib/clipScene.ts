import { decodeBlob } from './audio';
import { formatDate } from './db';
import { prepareSnapshot, type Prepared } from './images';
import { analyzeBuffer, computeTrack, estimateFloor } from './motion';
import type { SceneInfo } from './render';
import type { TimelineItem } from './timeline';
import type { Clip } from './types';

/**
 * 아이가 한 말: 입력한 값 → (옛 기록) 그림 이름과 다르게 바꿔 둔 자막 글자 → 없으면 빈 글자.
 * 저장된 기록은 고치지 않고 보여줄 때만 계산해요.
 */
export function utteranceOf(c: Clip): string {
  const u = c.utterance?.trim();
  if (u) return u;
  const cap = c.caption?.text?.trim();
  if (cap && cap !== c.word.trim() && cap !== c.pictureSnapshot.name.trim()) return cap;
  return '';
}

export function sceneFromClip(c: Clip, prepared: Prepared | null): SceneInfo {
  return {
    prepared,
    transform: c.pictureSnapshot.transform,
    anim: c.anim,
    title: c.showTitle && c.title.trim() ? c.title.trim() : undefined,
    date: c.showDate ? formatDate(c.createdAt) : undefined,
    // 자막: 부모가 적은 '아이가 한 말'이 있으면 그 말, 없으면 자막 글자(처음엔 그림 이름)
    caption: { ...c.caption, text: utteranceOf(c) || c.caption.text },
    months: c.showMonths && c.months != null ? `${c.months}개월` : undefined,
  };
}

export interface ClipAudio {
  buffer: AudioBuffer;
  rms: Float32Array;
  floor: number;
}

const cache = new WeakMap<Blob, Promise<ClipAudio>>();
export function loadClipAudio(c: Clip): Promise<ClipAudio> {
  let p = cache.get(c.audio);
  if (!p) {
    p = decodeBlob(c.audio).then((buffer) => {
      const rms = analyzeBuffer(buffer);
      return { buffer, rms, floor: estimateFloor(rms) };
    });
    cache.set(c.audio, p);
    p.catch(() => cache.delete(c.audio));
  }
  return p;
}

export async function clipItem(c: Clip): Promise<TimelineItem> {
  const [a, prep] = await Promise.all([loadClipAudio(c), prepareSnapshot(c.pictureSnapshot, c.id)]);
  const track = computeTrack(a.rms, { sensitivity: c.anim.sensitivity, speed: c.anim.speed }, a.floor);
  const end = Math.min(c.trimEnd || a.buffer.duration, a.buffer.duration);
  return { scene: sceneFromClip(c, prep), track, buf: a.buffer, trimStart: Math.max(0, Math.min(c.trimStart, end - 0.1)), trimEnd: end };
}
