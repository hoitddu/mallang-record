import { useEffect, useMemo, useState } from 'react';
import { ExportSheet } from '../components/ExportSheet';
import { Player } from '../components/Player';
import { Thumb } from '../components/Thumb';
import { Notice, TopBar } from '../components/ui';
import { encodeWav } from '../lib/audio';
import { BOOK_LAYOUTS, buildBookTimeline, type BookLayout } from '../lib/book';
import { clipItem, utteranceOf } from '../lib/clipScene';
import { formatDate, getClip } from '../lib/db';
import { timelineAudio, type Timeline } from '../lib/timeline';
import type { Clip } from '../lib/types';
import { useApp } from '../store';

/** 여러 단어 잇기: 기록들을 그림책처럼 한 장씩 넘기며 보여주고, 같은 모습으로 영상을 만들어요. */
export function Compose({ clipIds }: { clipIds: string[] }) {
  const { back, go, replace, settings, setSettings } = useApp();
  const [clips, setClips] = useState<Clip[]>([]);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const layout: BookLayout = settings.bookLayout ?? 'page';

  // 편집 화면에 다녀오면 바뀐 "아이가 한 말"이 보이도록 매번 새로 읽음
  useEffect(() => {
    Promise.all(clipIds.map(getClip)).then((cs) => setClips(cs.filter(Boolean) as Clip[]));
  }, [clipIds]);

  /** 그림책 자막: 아이가 한 말 (없으면 그림 이름) */
  const texts = useMemo(() => clips.map((c) => utteranceOf(c) || c.word), [clips]);
  const missing = clips.filter((c) => !utteranceOf(c)).length;

  useEffect(() => {
    if (!clips.length) return;
    let alive = true;
    (async () => {
      try {
        const items = await Promise.all(clips.map(clipItem));
        const t = buildBookTimeline(items, texts, layout);
        const wav = encodeWav(timelineAudio(t));
        if (!alive) return;
        setTl(t);
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(wav);
        });
      } catch {
        setErr('일부 기록의 소리를 열 수 없어요.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [clips, texts, layout]);

  // 순서를 바꾸면 화면 주소에도 기억 → 편집 화면에 다녀와도 순서 유지
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= clips.length) return;
    const n = clips.slice();
    [n[i], n[j]] = [n[j], n[i]];
    setClips(n);
    replace({ name: 'compose', clipIds: n.map((c) => c.id) });
  };

  return (
    <div className="page">
      <TopBar title="그림책으로 잇기" onBack={back} />
      {err && <Notice tone="error" title={err} />}

      <div className="-mx-1 mb-3 grid grid-cols-3 gap-2 px-1">
        {BOOK_LAYOUTS.map((o) => (
          <button
            key={o.v}
            className={`cut px-2 py-2.5 text-center ${layout === o.v ? 'bg-ink text-white' : 'bg-sheet text-ink shadow-paper'}`}
            aria-pressed={layout === o.v}
            onClick={() => setSettings({ ...settings, bookLayout: o.v })}
          >
            <span className="block font-display text-[15px] leading-tight">{o.label}</span>
            <span className={`mt-0.5 block text-[11px] leading-snug ${layout === o.v ? 'text-white/75' : 'text-soft'}`}>{o.desc}</span>
          </button>
        ))}
      </div>

      <Player timeline={tl} url={url} audioStart={0} audioEnd={tl?.total ?? 0} maxHeight="56dvh" />

      <button className="btn-main mt-4 w-full" disabled={!tl} onClick={() => setExportOpen(true)}>
        {clips.length}장짜리 그림책 영상 만들기
      </button>

      {missing > 0 && (
        <Notice tone="info" title={`${missing}개 기록에 아이가 한 말이 없어요`}>
          지금은 그림 이름으로 보여줘요. 아래 ✏️를 눌러 아이가 실제로 한 말을 적어 주세요.
        </Notice>
      )}

      <h2 className="mt-6 font-display text-[18px]">순서</h2>
      <ol className="mt-2 space-y-2">
        {clips.map((c, i) => {
          const u = utteranceOf(c);
          return (
            <li key={c.id} className="card flex items-center gap-3 p-2 pr-2">
              <span className="w-5 text-center font-display text-soft">{i + 1}</span>
              <Thumb src={c.pictureSnapshot} className="h-14 w-14 shrink-0 cut bg-paper" />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-display text-[18px] ${u ? '' : 'text-soft'}`}>{u ? `"${u}"` : '아이가 한 말 없음'}</p>
                <p className="truncate text-[12px] text-soft">
                  그림: {c.pictureSnapshot.name} · {formatDate(c.createdAt)}
                </p>
              </div>
              <button className="btn-ghost !px-2 text-ink" onClick={() => go({ name: 'clip', clipId: c.id })} aria-label={`${c.pictureSnapshot.name} 기록 고치기`}>
                ✏️
              </button>
              <div className="flex flex-col">
                <button className="btn-ghost !px-2 !py-1 text-ink" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">
                  ▲
                </button>
                <button className="btn-ghost !px-2 !py-1 text-ink" disabled={i === clips.length - 1} onClick={() => move(i, 1)} aria-label="아래로">
                  ▼
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="hint mt-3">미리보기와 만들어지는 영상은 똑같아요. 목소리·그림·글은 이 기기 안에서만 처리돼요.</p>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        fileBase={`말랑기록-그림책-${clips.map((c) => c.word).slice(0, 3).join('-')}`}
        build={async () => buildBookTimeline(await Promise.all(clips.map(clipItem)), texts, layout)}
      />
    </div>
  );
}
