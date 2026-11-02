import { useEffect, useState } from 'react';
import { ExportSheet } from '../components/ExportSheet';
import { Player } from '../components/Player';
import { Thumb } from '../components/Thumb';
import { Notice, TopBar } from '../components/ui';
import { encodeWav } from '../lib/audio';
import { clipItem } from '../lib/clipScene';
import { formatDate, getClip } from '../lib/db';
import { buildTimeline, timelineAudio, type Timeline } from '../lib/timeline';
import type { Clip } from '../lib/types';
import { useApp } from '../store';

export function Compose({ clipIds }: { clipIds: string[] }) {
  const { back } = useApp();
  const [clips, setClips] = useState<Clip[]>([]);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    Promise.all(clipIds.map(getClip)).then((cs) => setClips(cs.filter(Boolean) as Clip[]));
  }, [clipIds]);

  useEffect(() => {
    if (!clips.length) return;
    let alive = true;
    (async () => {
      try {
        const items = await Promise.all(clips.map(clipItem));
        const t = buildTimeline(items);
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
  }, [clips]);

  const move = (i: number, d: number) =>
    setClips((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length) return cs;
      const n = cs.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <div className="page">
      <TopBar title="여러 단어 한 영상으로" onBack={back} />
      {err && <Notice tone="error" title={err} />}
      <Player timeline={tl} url={url} audioStart={0} audioEnd={tl?.total ?? 0} maxHeight="48dvh" />

      <button className="btn-main mt-4 w-full" disabled={!tl} onClick={() => setExportOpen(true)}>
        {clips.length}개 이어서 영상 만들기
      </button>

      <h2 className="mt-6 font-display text-[18px]">순서</h2>
      <ol className="mt-2 space-y-2">
        {clips.map((c, i) => (
          <li key={c.id} className="card flex items-center gap-3 p-2 pr-3">
            <span className="w-6 text-center font-display text-soft">{i + 1}</span>
            <Thumb src={c.pictureSnapshot} className="h-14 w-14 shrink-0 cut bg-paper" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[17px]">{c.caption.text || c.word}</p>
              <p className="text-[12px] text-soft">{formatDate(c.createdAt)}</p>
            </div>
            <button className="btn-ghost !px-2 text-ink" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">
              ▲
            </button>
            <button className="btn-ghost !px-2 text-ink" disabled={i === clips.length - 1} onClick={() => move(i, 1)} aria-label="아래로">
              ▼
            </button>
          </li>
        ))}
      </ol>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        fileBase={`말랑기록-${clips.map((c) => c.word).slice(0, 3).join('-')}`}
        build={async () => buildTimeline(await Promise.all(clips.map(clipItem)))}
      />
    </div>
  );
}
