import { useEffect, useState } from 'react';
import { BUILTIN_MAP } from '../lib/builtins';
import { thumbUrl, transformStyle } from '../lib/images';
import type { ImgTransform } from '../lib/types';

export function Thumb({ src, className = '' }: { src: { builtinKey?: string; image?: Blob; transform?: ImgTransform }; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const { url, revoke } = thumbUrl(src);
    setUrl(url);
    return () => {
      if (revoke) URL.revokeObjectURL(url);
    };
  }, [src.image, src.builtinKey]);
  const tf = src.transform ?? { scale: 1, x: 0, y: 0 };
  // 기본 그림은 입을 지워 두었으니 썸네일에는 미소를 그려 넣음
  const mouth = !src.image && src.builtinKey ? BUILTIN_MAP[src.builtinKey]?.mouth : undefined;
  return (
    <div className={`relative aspect-square overflow-hidden ${className}`}>
      {url && (
        <div className="absolute inset-[10%]" style={{ transform: transformStyle(tf) }}>
          <img src={url} alt="" draggable={false} className="h-full w-full object-contain" />
          {mouth && (
            <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <path
                d={`M ${(mouth.x - mouth.w * 0.38) * 100} ${mouth.y * 100 - mouth.w * 18} Q ${mouth.x * 100} ${mouth.y * 100 + mouth.w * 34} ${(mouth.x + mouth.w * 0.38) * 100} ${mouth.y * 100 - mouth.w * 18}`}
                stroke={mouth.color}
                strokeWidth={Math.max(0.9, mouth.w * 15)}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
