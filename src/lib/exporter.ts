import { audioCtx, unlockAudio } from './audio';
import { renderScene } from './render';
import { sceneAt, timelineAudio, type Timeline } from './timeline';

export interface VideoFormat {
  mime: string;
  ext: 'mp4' | 'webm';
  label: string;
}

const CANDIDATES: VideoFormat[] = [
  { mime: 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', ext: 'mp4', label: 'MP4' },
  { mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4', label: 'MP4' },
  { mime: 'video/mp4', ext: 'mp4', label: 'MP4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm', label: 'WebM' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm', label: 'WebM' },
  { mime: 'video/webm', ext: 'webm', label: 'WebM' },
];

/** 이 브라우저에서 만들 수 있는 영상 형식 (MP4 우선) */
export function detectVideoFormat(): VideoFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const c = document.createElement('canvas');
  if (typeof (c as any).captureStream !== 'function') return null;
  for (const f of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(f.mime)) return f;
    } catch {}
  }
  return null;
}

export interface ExportOptions {
  timeline: Timeline;
  width: number;
  height: number;
  onProgress?: (p: number) => void;
  signal?: { cancelled: boolean };
}

export interface ExportResult {
  blob: Blob;
  format: VideoFormat;
}

/**
 * 영상 만들기: 캔버스 그림 + 아이 원래 목소리를 실시간으로 함께 녹화합니다.
 * 그림의 움직임은 오디오 시계(AudioContext.currentTime)를 기준으로 그려서 소리와 맞춥니다.
 * 모든 처리는 이 기기 안에서만 이루어집니다.
 */
export async function exportVideo(o: ExportOptions): Promise<ExportResult> {
  const format = detectVideoFormat();
  if (!format) throw new Error('이 브라우저는 영상 만들기를 지원하지 않아요. iPhone은 Safari, Android는 Chrome 최신 버전에서 열어 주세요.');
  const ctx = unlockAudio();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

  const { width: W, height: H, timeline } = o;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  // Safari는 화면에 붙어 있는 캔버스에서 더 안정적으로 녹화됨
  Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', width: '4px', height: '8px', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d')!;

  const audio = timelineAudio(timeline);
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = audio;
  src.connect(dest);

  const vstream: MediaStream = (canvas as any).captureStream(30);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

  let wake: any = null;
  try {
    wake = await (navigator as any).wakeLock?.request('screen');
  } catch {}

  const draw = (t: number) => {
    if (timeline.draw) return timeline.draw(g, W, H, t);
    const { scene, frame } = sceneAt(timeline, t);
    renderScene(g, W, H, scene, frame);
  };
  draw(0);

  const rec = new MediaRecorder(stream, {
    mimeType: format.mime,
    videoBitsPerSecond: W >= 1000 ? 8_000_000 : 5_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res, rej) => {
    rec.onstop = () => res();
    rec.onerror = (e: any) => rej(e?.error || new Error('영상 녹화 중 문제가 생겼어요'));
  });

  rec.start(1000);
  const startAt = ctx.currentTime + 0.2;
  src.start(startAt);

  try {
    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      let timer = 0;
      const tick = () => {
        if (o.signal?.cancelled) {
          cancelAnimationFrame(raf);
          clearInterval(timer);
          reject(new Error('cancelled'));
          return;
        }
        const t = ctx.currentTime - startAt;
        draw(Math.max(0, t));
        o.onProgress?.(Math.max(0, Math.min(1, t / timeline.total)));
        if (t >= timeline.total) {
          cancelAnimationFrame(raf);
          clearInterval(timer);
          resolve();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // 화면이 잠깐 가려질 때 대비 (rAF가 멈추면 타이머로 계속)
      timer = window.setInterval(() => {
        if (document.hidden) tick();
      }, 1000 / 30);
    });
  } finally {
    try {
      src.stop();
    } catch {}
    if (rec.state !== 'inactive') rec.stop();
    try {
      await stopped;
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
    canvas.remove();
    try {
      await wake?.release();
    } catch {}
  }
  const blob = new Blob(chunks, { type: format.mime.split(';')[0] });
  if (!blob.size) throw new Error('영상이 비어 있어요. 화면을 켠 채로 다시 시도해 주세요.');
  return { blob, format };
}

export { audioCtx };
