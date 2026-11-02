import { useEffect, useRef } from 'react';

/**
 * 9:16 캔버스 무대. draw는 매 프레임 호출되며 (ctx, 너비, 높이)를 받습니다.
 * 화면에 보이는 장면과 저장되는 영상은 같은 그리기 함수를 씁니다.
 */
export function Stage({
  draw,
  className = '',
  aspect = 9 / 16,
  maxHeight = '62dvh',
  onPointer,
}: {
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number, now: number) => void;
  className?: string;
  aspect?: number;
  maxHeight?: string;
  onPointer?: (e: React.PointerEvent<HTMLCanvasElement>, W: number, H: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const size = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    };
    const ro = new ResizeObserver(size);
    ro.observe(c);
    size();
    const loop = (now: number) => {
      try {
        drawRef.current(g, c.width, c.height, now / 1000);
      } catch (e) {
        console.error(e);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`mx-auto ${className}`} style={{ aspectRatio: String(aspect), width: `min(100%, calc(${maxHeight} * ${aspect}))` }}>
      <canvas
        ref={ref}
        className="block h-full w-full cut-b shadow-paper"
        style={{ touchAction: onPointer ? 'none' : 'auto' }}
        onPointerDown={onPointer ? (e) => onPointer(e, ref.current!.width, ref.current!.height) : undefined}
        onPointerMove={onPointer ? (e) => onPointer(e, ref.current!.width, ref.current!.height) : undefined}
        onPointerUp={onPointer ? (e) => onPointer(e, ref.current!.width, ref.current!.height) : undefined}
      />
    </div>
  );
}
