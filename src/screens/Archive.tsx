import { useEffect, useRef, useState } from 'react';
import { Thumb } from '../components/Thumb';
import { TopBar } from '../components/ui';
import { utteranceOf } from '../lib/clipScene';
import { formatDate, listClips } from '../lib/db';
import type { Clip } from '../lib/types';
import { useApp } from '../store';

export function Archive() {
  const { back, go } = useApp();
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    listClips().then(setClips);
    return () => {
      audio.current?.pause();
    };
  }, []);

  function playQuick(c: Clip) {
    if (audio.current) {
      audio.current.pause();
      URL.revokeObjectURL(audio.current.src);
    }
    if (playingId === c.id) {
      setPlayingId(null);
      return;
    }
    const a = new Audio(URL.createObjectURL(c.audio));
    a.currentTime = c.trimStart;
    a.ontimeupdate = () => {
      if (a.currentTime >= (c.trimEnd || c.duration)) a.pause();
    };
    a.onpause = () => setPlayingId((id) => (id === c.id ? null : id));
    audio.current = a;
    a.play().then(() => setPlayingId(c.id)).catch(() => setPlayingId(null));
  }

  const toggleSel = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="page">
      <TopBar
        title="이전 기록 보기"
        onBack={back}
        right={
          clips && clips.length > 1 ? (
            <button className="btn-ghost text-ink" onClick={() => { setSelecting((v) => !v); setSel([]); }}>
              {selecting ? '취소' : '여러 개 잇기'}
            </button>
          ) : undefined
        }
      />
      {selecting && <p className="hint -mt-1 mb-3">이어 붙일 순서대로 눌러 주세요. 다음 화면에서 순서를 바꿀 수 있어요.</p>}

      {clips === null ? null : clips.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="font-display text-[19px]">아직 기록이 없어요</p>
          <p className="hint mt-2">첫 단어를 녹음하면 여기에 그림책 카드로 모여요.</p>
          <button className="btn-main mt-5" onClick={() => go({ name: 'pick' })}>
            새 단어 기록하기
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {clips.map((c) => {
            const idx = sel.indexOf(c.id);
            return (
              <li key={c.id} className="relative">
                <button
                  className={`card block w-full overflow-hidden text-left transition-transform active:scale-[0.98] ${idx >= 0 ? 'ring-4 ring-tangerine' : ''}`}
                  onClick={() => (selecting ? toggleSel(c.id) : go({ name: 'clip', clipId: c.id }))}
                >
                  <Thumb src={c.pictureSnapshot} className="bg-paper" />
                  <div className="px-3 pb-3 pt-1">
                    <p className="truncate font-display text-[19px]">{utteranceOf(c) || c.caption.text || c.word}</p>
                    <p className="truncate text-[12px] text-soft">
                      {utteranceOf(c) && `${c.pictureSnapshot.name} · `}
                      {formatDate(c.createdAt)}
                      {c.months != null && ` · ${c.months}개월`}
                    </p>
                  </div>
                  {selecting && (
                    <span className={`absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full font-display text-[15px] ${idx >= 0 ? 'bg-tangerine text-white' : 'bg-white/90 text-soft shadow-paper'}`}>
                      {idx >= 0 ? idx + 1 : ''}
                    </span>
                  )}
                </button>
                {!selecting && (
                  <button
                    className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-sky text-white shadow-paper active:scale-95"
                    aria-label={`${c.word} 목소리 듣기`}
                    onClick={() => playQuick(c)}
                  >
                    {playingId === c.id ? (
                      <svg width="14" height="14" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="2" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="2" fill="currentColor" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor" /></svg>
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {selecting && sel.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center bg-paper/95 py-3 backdrop-blur" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))', paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
          <button className="btn-main w-full max-w-[520px]" onClick={() => go({ name: 'compose', clipIds: sel })}>
            {sel.length}개를 그림책으로 잇기
          </button>
        </div>
      )}
    </div>
  );
}
