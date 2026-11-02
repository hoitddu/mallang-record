import { useEffect, useRef, useState } from 'react';
import { IDLE_FRAME } from '../lib/motion';
import { renderScene } from '../lib/render';
import { sceneAt, type Timeline } from '../lib/timeline';
import { Stage } from './Stage';

/**
 * 미리보기 재생기: <audio>로 원래 목소리를 재생하고 (iPhone 무음 모드에서도 들림),
 * 재생 위치에 맞춰 같은 장면을 그립니다.
 */
export function Player({
  timeline,
  url,
  audioStart,
  audioEnd,
  maxHeight = '56dvh',
}: {
  timeline: Timeline | null;
  url: string;
  audioStart: number;
  audioEnd: number;
  maxHeight?: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const endedAt = useRef<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    audio.current?.pause();
    setPlaying(false);
  }, [url, audioStart, audioEnd]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    endedAt.current = null;
    try {
      a.currentTime = audioStart;
    } catch {}
    a.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  const draw = (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => {
    if (!timeline) return;
    const a = audio.current;
    let t: number;
    let still = false;
    if (playing && a) {
      if (a.currentTime >= audioEnd - 0.01 || a.ended) {
        a.pause();
        endedAt.current = now;
        setPlaying(false);
      }
      t = a.currentTime - audioStart;
    } else if (endedAt.current !== null && now - endedAt.current < 1.2) {
      t = audioEnd - audioStart + (now - endedAt.current);
    } else {
      t = 0;
      still = true;
    }
    if (timeline.draw) {
      // 그림책처럼 장면을 직접 그리는 방식 (영상 만들기와 같은 코드)
      timeline.draw(ctx, W, H, t, still ? now : undefined);
      if (bar.current) bar.current.style.transform = `scaleX(${still ? 0 : Math.min(1, t / Math.max(0.1, audioEnd - audioStart))})`;
      return;
    }
    const { scene, frame } = sceneAt(timeline, t);
    if (still) {
      renderScene(ctx, W, H, { ...scene, captionReveal: 1, alpha: 1 }, { ...IDLE_FRAME, t: now });
    } else {
      renderScene(ctx, W, H, scene, { ...frame, t: frame.t });
    }
    if (bar.current) {
      const p = still ? 0 : Math.min(1, t / Math.max(0.1, audioEnd - audioStart));
      bar.current.style.transform = `scaleX(${p})`;
    }
  };

  return (
    <div>
      <Stage draw={draw} maxHeight={maxHeight} />
      <audio ref={audio} src={url} preload="auto" onPause={() => setPlaying(false)} />
      <div className="mx-auto mt-3 flex max-w-[360px] items-center gap-3">
        <button
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky text-white shadow-paper active:scale-95"
          onClick={toggle}
          aria-label={playing ? '멈추기' : '재생'}
          disabled={!timeline}
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="2" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="2" fill="currentColor" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" /></svg>
          )}
        </button>
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-line">
          <div ref={bar} className="absolute inset-0 origin-left rounded-full bg-sky" style={{ transform: 'scaleX(0)' }} />
        </div>
        <span className="w-14 text-right text-[13px] tabular-nums text-soft">{(audioEnd - audioStart).toFixed(1)}초</span>
      </div>
    </div>
  );
}
